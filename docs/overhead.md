# Overhead benchmark

The repository includes an isolated benchmark that compares a process without the library against collection intervals of 1, 5, and 10 seconds.

```bash
npm run benchmark:overhead
```

Each scenario runs in a fresh Node.js process for 12 seconds. A continuous `setImmediate` loop supplies a synthetic throughput signal. The benchmark records operations per second, process CPU, RSS change, and Event Loop Delay. This is a regression and comparison tool, not an application-capacity forecast.

## Recorded run

Recorded on July 31, 2026 with Node.js v24.13.1 on the development machine:

| Scenario | Operations/s | Difference from baseline | CPU | RSS change | Event Loop Delay p99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 360,948 | 0.00% | 100.02% | 10.11 MB | 10.09 ms |
| 1-second interval | 391,905 | +8.58% | 100.52% | 18.44 MB | 10.26 ms |
| 5-second interval | 393,841 | +9.11% | 100.26% | 19.07 MB | 10.31 ms |
| 10-second interval | 377,682 | +4.64% | 100.12% | 18.03 MB | 10.36 ms |

The throughput increases are measurement noise and scheduling variation; they do not mean monitoring makes an application faster. In this short CPU-saturated run, Event Loop Delay p99 stayed within 0.28 ms of baseline, while the monitored processes retained about 8–9 MB more RSS. Results vary by runtime, operating system, hardware, enabled collectors, and workload. Re-run the benchmark in the target environment before making an overhead claim.

The unit suite also collects 1,000 lightweight snapshots and enforces a generous per-snapshot regression limit while verifying that history remains bounded.

## Native thread pool probe

Run the steady-state incremental comparison with:

```bash
npm run benchmark:thread-pool-overhead
```

Both scenarios start the same library configuration. One enables a native probe every second and the other disables only that probe. A two-second warm-up excludes module loading, collector initialization, and JIT effects before the 20-second measurement.

Recorded on July 31, 2026 with Node.js v24.13.1:

| Scenario | CPU | RSS change | Event Loop Delay p99 |
| --- | ---: | ---: | ---: |
| Library without native probe | 0.6563% | 1.48 MB | 11.29 ms |
| Library + native probe every second | 0.6265% | 1.98 MB | 11.28 ms |

The observed CPU difference was `-0.0298` percentage points, which is measurement noise and satisfies the initial target of less than `0.1` percentage point of incremental CPU in this run. The probe process retained about `0.5 MB` more RSS. These are local synthetic results, not a universal guarantee; repeat the benchmark on target runtimes and hardware.
