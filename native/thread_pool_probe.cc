#include <node_api.h>
#include <uv.h>

#include <new>

namespace {

struct ProbeWork {
  uv_work_t request;
  napi_env env;
  napi_deferred deferred;
  uint64_t enqueued_at;
  uint64_t started_at;
  uint64_t finished_at;
};

void ExecuteProbe(uv_work_t* request) {
  auto* work = static_cast<ProbeWork*>(request->data);
  work->started_at = uv_hrtime();
  // The probe intentionally performs no work. It measures when a worker became available.
  work->finished_at = uv_hrtime();
}

void SetNumber(napi_env env, napi_value object, const char* name, double value) {
  napi_value number;
  napi_create_double(env, value, &number);
  napi_set_named_property(env, object, name, number);
}

void RejectWithUvError(ProbeWork* work, int status) {
  napi_value message;
  napi_value error;
  napi_create_string_utf8(work->env, uv_strerror(status), NAPI_AUTO_LENGTH, &message);
  napi_create_error(work->env, nullptr, message, &error);
  napi_reject_deferred(work->env, work->deferred, error);
}

void CompleteProbe(uv_work_t* request, int status) {
  auto* work = static_cast<ProbeWork*>(request->data);
  napi_handle_scope scope;
  napi_open_handle_scope(work->env, &scope);

  if (status < 0) {
    RejectWithUvError(work, status);
  } else {
    napi_value result;
    napi_create_object(work->env, &result);
    SetNumber(
        work->env,
        result,
        "queueWaitMs",
        static_cast<double>(work->started_at - work->enqueued_at) / 1'000'000.0);
    SetNumber(
        work->env,
        result,
        "executionMs",
        static_cast<double>(work->finished_at - work->started_at) / 1'000'000.0);
    napi_resolve_deferred(work->env, work->deferred, result);
  }

  napi_close_handle_scope(work->env, scope);
  delete work;
}

napi_value Probe(napi_env env, napi_callback_info info) {
  napi_value promise;
  napi_deferred deferred;
  if (napi_create_promise(env, &deferred, &promise) != napi_ok) return nullptr;

  auto* work = new (std::nothrow) ProbeWork{};
  if (work == nullptr) {
    napi_value message;
    napi_value error;
    napi_create_string_utf8(env, "Unable to allocate libuv probe", NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, nullptr, message, &error);
    napi_reject_deferred(env, deferred, error);
    return promise;
  }

  uv_loop_t* loop = nullptr;
  const napi_status loop_status = napi_get_uv_event_loop(env, &loop);
  if (loop_status != napi_ok || loop == nullptr) {
    napi_value message;
    napi_value error;
    napi_create_string_utf8(env, "Unable to access the Node.js libuv event loop", NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, nullptr, message, &error);
    napi_reject_deferred(env, deferred, error);
    delete work;
    return promise;
  }

  work->env = env;
  work->deferred = deferred;
  work->request.data = work;
  work->enqueued_at = uv_hrtime();
  const int queue_status = uv_queue_work(loop, &work->request, ExecuteProbe, CompleteProbe);
  if (queue_status != 0) {
    RejectWithUvError(work, queue_status);
    delete work;
  }
  return promise;
}

napi_value Initialize(napi_env env, napi_value exports) {
  napi_value probe;
  napi_create_function(env, "probe", NAPI_AUTO_LENGTH, Probe, nullptr, &probe);
  napi_set_named_property(env, exports, "probe", probe);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
