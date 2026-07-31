const MAX_POINTS = 60;
const eluHistory = [];
const delayHistory = [];

const elements = {
  connection: document.querySelector("#connection"),
  connectionText: document.querySelector("#connectionText"),
  eluValue: document.querySelector("#eluValue"),
  delayValue: document.querySelector("#delayValue"),
  cpuValue: document.querySelector("#cpuValue"),
  heapValue: document.querySelector("#heapValue"),
  eluMeter: document.querySelector("#eluMeter"),
  delayMeter: document.querySelector("#delayMeter"),
  lastUpdated: document.querySelector("#lastUpdated"),
  requestStatus: document.querySelector("#requestStatus"),
  result: document.querySelector("#result"),
  resultPlaceholder: document.querySelector("#resultPlaceholder"),
  resultRoute: document.querySelector("#resultRoute"),
  resultDuration: document.querySelector("#resultDuration"),
  resultMessage: document.querySelector("#resultMessage"),
  eluChart: document.querySelector("#eluChart"),
  delayChart: document.querySelector("#delayChart"),
  alertsCount: document.querySelector("#alertsCount"),
  alertsList: document.querySelector("#alertsList"),
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function appendPoint(history, value) {
  history.push(Number.isFinite(value) ? value : 0);
  if (history.length > MAX_POINTS) history.shift();
}

function drawChart(canvas, history, color, minimumMaximum) {
  const context = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));

  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const padding = { top: 10, right: 8, bottom: 22, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const observedMaximum = Math.max(...history, minimumMaximum);
  const maximum = Math.ceil(observedMaximum * 1.12);

  context.strokeStyle = "rgba(255,255,255,.07)";
  context.fillStyle = "rgba(144,153,173,.8)";
  context.font = "10px ui-sans-serif, system-ui";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index;
    const value = maximum - (maximum / 4) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(value.toFixed(value < 10 ? 1 : 0), padding.left - 8, y);
  }

  if (history.length === 0) return;

  const points = history.map((value, index) => ({
    x: padding.left + (index / Math.max(MAX_POINTS - 1, 1)) * chartWidth,
    y: padding.top + chartHeight - (value / maximum) * chartHeight,
  }));
  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, `${color}55`);
  gradient.addColorStop(1, `${color}00`);

  context.beginPath();
  context.moveTo(points[0].x, height - padding.bottom);
  for (const point of points) context.lineTo(point.x, point.y);
  context.lineTo(points.at(-1).x, height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.stroke();

  const latest = points.at(-1);
  context.beginPath();
  context.arc(latest.x, latest.y, 3.5, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function renderCharts() {
  drawChart(elements.eluChart, eluHistory, "#6ea8fe", 100);
  drawChart(elements.delayChart, delayHistory, "#ff6b7a", 25);
}

function renderSnapshot(snapshot) {
  const utilization = snapshot.eventLoopUtilization.utilizationPercent ?? 0;
  const delay = snapshot.eventLoopDelay.maxMs ?? 0;
  const cpu = snapshot.cpu.usagePercent ?? 0;
  const heapMb = snapshot.memory.heapUsedBytes / 1024 / 1024;

  elements.eluValue.textContent = utilization.toFixed(1);
  elements.delayValue.textContent = delay.toFixed(1);
  elements.cpuValue.textContent = cpu.toFixed(1);
  elements.heapValue.textContent = heapMb.toFixed(1);
  elements.eluMeter.style.width = `${clamp(utilization, 0, 100)}%`;
  elements.delayMeter.style.width = `${clamp((delay / 250) * 100, 0, 100)}%`;
  elements.lastUpdated.textContent = `Updated ${new Date(snapshot.timestamp).toLocaleTimeString()}`;

  appendPoint(eluHistory, utilization);
  appendPoint(delayHistory, delay);
  renderCharts();
  renderAlerts(snapshot.recentAlerts ?? snapshot.alerts ?? []);
}

function formatAlertValue(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  return value.toFixed(1);
}

function renderAlerts(alerts) {
  const sorted = [...alerts].sort((left, right) => {
    const rank = { critical: 2, warning: 1, info: 0 };
    return (rank[right.severity] ?? 0) - (rank[left.severity] ?? 0);
  });
  const highestSeverity = sorted.some(({ severity }) => severity === "critical")
    ? "critical"
    : sorted.length > 0 ? "warning" : "healthy";

  elements.alertsCount.textContent = `${sorted.length} recent`;
  elements.alertsCount.className = `alerts-count ${highestSeverity}`;

  if (sorted.length === 0) {
    elements.alertsList.innerHTML = `
      <div class="alerts-empty">
        <span class="checkmark">✓</span>
        <div>
          <strong>No recent alerts</strong>
          <p>All monitored values are below the configured thresholds.</p>
        </div>
      </div>`;
    return;
  }

  elements.alertsList.replaceChildren(...sorted.map((alert) => {
    const item = document.createElement("article");
    item.className = `alert-item ${alert.severity}`;

    const title = document.createElement("div");
    title.className = "alert-title";
    const code = document.createElement("span");
    code.className = "alert-code";
    code.textContent = alert.code;
    const severity = document.createElement("span");
    severity.className = "alert-severity";
    severity.textContent = alert.severity;
    title.append(code, severity);

    const message = document.createElement("p");
    message.className = "alert-message";
    message.textContent = alert.message;

    const values = document.createElement("div");
    values.className = "alert-values";
    values.innerHTML = `
      <span>Value <strong>${formatAlertValue(alert.value)}</strong></span>
      <span>Threshold <strong>${formatAlertValue(alert.threshold)}</strong></span>`;

    item.append(title, message, values);
    return item;
  }));
}

async function pollMetrics() {
  try {
    const response = await fetch("/api/metrics", { cache: "no-store" });
    if (!response.ok) throw new Error(`Metrics returned HTTP ${response.status}`);
    renderSnapshot(await response.json());
    elements.connection.className = "connection online";
    elements.connectionText.textContent = "Live";
  } catch (error) {
    elements.connection.className = "connection offline";
    elements.connectionText.textContent = "Disconnected";
    console.error(error);
  }
}

function setRequestStatus(label, className) {
  elements.requestStatus.textContent = label;
  elements.requestStatus.className = `request-status ${className}`;
}

async function callRoute(route) {
  const buttons = [...document.querySelectorAll(".action")];
  buttons.forEach((button) => { button.disabled = true; });
  setRequestStatus("Running", "loading");
  const startedAt = performance.now();

  try {
    const response = await fetch(route);
    const payload = await response.json();
    const duration = performance.now() - startedAt;
    elements.resultPlaceholder.classList.add("hidden");
    elements.result.classList.remove("hidden");
    elements.resultRoute.textContent = route;
    elements.resultDuration.textContent = `${duration.toFixed(1)} ms`;
    elements.resultMessage.textContent = payload.message;
    setRequestStatus("Completed", "success");
  } catch (error) {
    elements.resultPlaceholder.classList.remove("hidden");
    elements.resultPlaceholder.textContent = error instanceof Error ? error.message : String(error);
    elements.result.classList.add("hidden");
    setRequestStatus("Failed", "error");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    window.setTimeout(pollMetrics, 150);
  }
}

document.querySelectorAll(".action").forEach((button) => {
  button.addEventListener("click", () => callRoute(button.dataset.route));
});

window.addEventListener("resize", renderCharts);
pollMetrics();
window.setInterval(pollMetrics, 1_000);
