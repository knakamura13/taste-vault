# Local SSR baseline

`2026-11-13-local-ssr.json` records one exploratory run of `tests/performance.mjs` on 2026-11-13. It used a built app on an arm64 Mac, Node 26.13.1, PostgreSQL 17 in Docker, and 10,000 synthetic text-only references. Each case sent five warm-up requests followed by 20 sequential localhost requests, reading each entire HTML response. The file includes the observed range, median, approximate p95, payload size and error count.

This is a baseline, not a comparison or a promise of real-world speed. It excludes screenshots, thumbnail generation, browser rendering, network latency, cold caches, background capture and concurrent clients. Only one batch was run; repeat and extend it on representative data before drawing conclusions or reporting a speedup. Use a dedicated empty disposable database named `taste_perf_test`; the harness inserts synthetic references.

## Image gallery comparison

`2026-11-13-local-gallery.json` records five alternating rounds on the same arm64 Mac, using the built gallery and PostgreSQL 17 in Docker. Each round opened three concurrent, fresh Chrome contexts on a gallery of 180 synthetic 1920×1080 PNG screenshots. The cold test cleared the server's thumbnail directory, while the warm test reused those files with fresh browser caches. The warm search matched 90 references. Each gallery visit decoded 18 previews intersecting a 1440×900 viewport. The harness required the expected result count and zero failed requests.

| Time from navigation to visible previews decoded | Baseline median (range) | Shared resize median (range) |
| --- | ---: | ---: |
| Cold gallery, 15 visits per build | 342 ms (314–440) | 219 ms (148–399) |
| Warm gallery, 15 visits per build | 200 ms (111–235) | 156 ms (125–185) |
| Warm search, 5 visits per build | 69 ms (56–90) | 66 ms (63–86) |

The cold gallery improved in four of five rounds by comparing each round's median of three concurrent visits. The ranges overlap, and the warm and search runs do not isolate a reliable speedup. Fixture images use flat colors and the test uses localhost, so these results exclude network delays, photo-heavy libraries, and hosted resource limits.

Run `node tests/gallery-performance.mjs` after building. Supply `DATABASE_URL` for an empty, migrated database named `taste_gallery_bench_<suffix>`, an empty temporary `TASTE_STORAGE_DIR`, and `CHROME_PATH`. Set `TASTE_BASELINE_BUILD` to a separate runnable adapter-node build to compare it with the current build.

## Temporary Alarm UI library

Set `TASTE_FIXTURE_DIR` to a local directory of PNGs to use supplied images instead of synthetic panels. The harness copies every image at 0.5×, 1×, and 2× dimensions into disposable storage, preserving originals. These are test fixtures only and must not be bundled into the shipped library. It records fixture dimensions and encoded sizes alongside browser measurements, and checks horizontal overflow at 320px and 390px. Newest-first ordering deliberately places double-resolution copies on the first gallery page. This directly seeds database rows for rendering measurements; it does not measure upload throughput or validate intake limits.

The supplied Alarm UI run uses 132 source PNGs and 396 derived references. Cold/warm desktop cases each use three concurrent fresh browser contexts per round; mobile and narrow checks are sequential with warm server thumbnails. Five rounds run on localhost. This is a current-build baseline, not a before/after speedup comparison or mobile-device hardware measurement.

Results in `2026-11-13-alarm-gallery.json`: 541,865,034 encoded fixture bytes, dimensions up to 6000px wide and 7600px high. Navigation-to-visible-preview-decode medians (ranges) were 377 ms (301–511) cold desktop, 124 ms (102–145) warm desktop, 64 ms (58–70) search, 56 ms (48–63) at 390px, and 50 ms (47–60) at 320px. All requests and visible image decodes succeeded, with no detected horizontal overflow. Desktop and 390px screenshots were also visually inspected. Phone-width runs use desktop Chrome hardware and warm thumbnails, so their timings are not real-phone performance evidence.
