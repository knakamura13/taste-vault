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

## Large-library typed-filter comparison

`2026-11-13-large-filters.json` records five alternating baseline/current rounds on the local arm64 Mac and Docker PostgreSQL 17. The library has 50,000 references, 500 projects, 100 categories, one project/category assignment per reference, and 50,000 approved screenshot description rows. Image files are deliberately absent; the harness fetches full HTML/JSON responses without requesting image bytes. Each case has three warmups and ten sequential timed requests per build per round (50 measured responses per arm). Every response must be 200 with the expected result count. No failures were excluded.

The baseline is the application before changing UUID filter columns from text comparisons to typed UUID comparisons. Both builds share the same database. Project-gallery/search cases match 100 references, category gallery 500, API page 25, and API no-match zero. Rounded navigation/request start to full-response read measurements:

| Case | Baseline median (range) | Typed filter median (range) |
| --- | ---: | ---: |
| Project gallery | 25 ms (20–74) | 20 ms (16–50) |
| Category gallery | 23 ms (19–38) | 20 ms (16–43) |
| Project gallery with search | 186 ms (125–469) | 125 ms (114–258) |
| Project API page | 16 ms (11–44) | 9 ms (7–46) |
| Project API no-match | 26 ms (19–76) | 23 ms (15–72) |

Project search and project API round medians improved in all five rounds. Ranges overlap and there is substantial host variation. This supports a local improvement for this sparse-membership workload, not a general or hosted latency guarantee. The main correctness change also accepts uppercase UUID filters consistently; integration tests verify that behavior and project isolation. Counts, assignments and SQL fixtures are identical between builds. Timings include network stack, SQL, SSR/JSON serialization and response reading; SQL scans, host load, and localhost overhead limit the result. No extension or schema migration is needed.

Run `node tests/large-library.mjs` with an empty migrated `taste_large_bench_<suffix>` database, `DATABASE_URL`, and `TASTE_BASELINE_BUILD` pointing to a separate runnable adapter-node build. The current build must already exist. The harness inserts metadata fixtures and leaves the disposable database populated. It does not exercise image delivery, browser rendering, concurrent requests, real-user sessions, or WAN/hosted resource limits.

## Mixed library browser baseline

Set `TASTE_EXTENDED_GALLERY=1` and supply the temporary PNG directory to the gallery harness. The run recorded in `2026-11-13-mixed-library-browser.json` combined 50,000 metadata references with 2,376 image-backed references derived from 132 PNGs. There were 238 references with a second image. The dense project has 27,376 references and the sparse project has 119. Most variants are capped at 1,600 pixels wide to bound storage, with the newest 60 kept at their scaled size. The harness checks result counts, image decoding, failed requests, and horizontal overflow.

Five rounds ran on a local arm64 Mac with Docker PostgreSQL 17, Node 26.13.1 and Chrome 157. Each desktop cold/warm opening had three concurrent fresh browser contexts per round. Phone-width and sparse-project journeys ran sequentially. Cold clears the server thumbnail cache, while warm uses the populated server cache and fresh browser contexts. The sparse project starts with a mix of generated and missing thumbnail files. The Chrome and PostgreSQL processes ran on the same machine. The tests exercised a built application and full browser navigation over localhost.

| Browser action | Median (range) | Samples |
| --- | ---: | ---: |
| Desktop first visible previews, cold | 451 ms (356–630) | 15 |
| Desktop first visible previews, warm | 143 ms (132–173) | 15 |
| Search to visible previews | 305 ms (217–414) | 5 |
| 390px first visible previews | 66 ms (51–72) | 5 |
| 390px scroll to last preview | 56 ms (50–78) | 5 |
| 390px next page to first preview | 118 ms (109–149) | 5 |
| 390px open original | 110 ms (70–220) | 5 |
| 390px Back to gallery | 33 ms (27–81) | 5 |
| Sparse project scroll to last preview | 276 ms (231–336) | 5 |

Desktop first visible previews totaled about 89 KB encoded. The original opened in the sparse-project journey was about 1.44 MB. All recorded requests and visible image decodes succeeded. This is a single-build baseline with overlapping host activity during the run. It leaves peak CPU/RSS, physical phones, WAN, and Railway limits unmeasured. The sparse-project scroll and search are candidates for profiling in the next comparison.
