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

## Gallery search profile

The mixed fixture library was reused on the same local machine for the baseline at `264a751` and the query change. Set `TASTE_REUSE_GALLERY=1` alongside the extended-mode inputs and point `TASTE_BASELINE_BUILD` at a runnable build from before the change. Each build gets the same cases and thumbnail-cache reset schedule. In the SQL plan for the broad dashboard query, the old search evaluated category and description aggregates once per reference. The revised query groups both sources by reference once and joins the results. Search semantics still join fields with spaces and match a case-insensitive substring. Category and approved-description matching are covered in the trial suite. The benchmark fixture has sparse related metadata, so use the result primarily for broad queries in that workload.

An isolated encoder comparison on 40 fixture originals ran five alternating pairs with quality 75 and the same dimensions. WebP effort 4 took 748–835 ms per batch, while effort 2 took 689–828 ms. Total output increased from 232,456 to 242,148 bytes. The ranges overlap and browser scrolling remained variable, so the change retains the existing encoding settings.

Two batches of five alternating runs per build used the same 52,376 references, 2,376 image-backed records, image files, and cache schedule. Each search checked the reference count, decoded 18 visible previews and transferred the same 101,662 encoded preview bytes. Counts, image decodes and requests passed in every run. The first batch overlapped briefly with the integration suite. The repeat ran separately. Raw data is in `2026-11-13-gallery-search-profile.json`.

| Path | Baseline median (range) | Revised median (range) | Samples per build |
| --- | ---: | ---: | ---: |
| Broad search to visible previews | 330 ms (268–415) | 89 ms (80–279) | 10 |
| Broad search to response start | 265 ms (219–351) | 38 ms (30–41) | 10 |
| Sparse-project scroll to last preview | 266 ms (227–387) | 263 ms (236–378) | 10 |
| Desktop cold gallery | 473 ms (384–599) | 449 ms (321–1,000) | 30 |
| Desktop warm gallery | 151 ms (122–197) | 159 ms (100–249) | 30 |

Search response start improved in all ten pairs; previews improved in nine. In the exception the response started at 38 ms but decoding finished at 279 ms, so the delay occurred after response start. Its specific cause was unmeasured. Cold and warm gallery counts, thumbnail bytes, and encoding were common between builds. Their timings varied in both directions between batches, and the scrolling ranges overlap. The measurements support a broad-search improvement for this local workload. Search still scans reference text, and image decoding can dominate the remaining browser time. Hosted load, resource usage and dense category/description assignments were outside this comparison.

## Browsing during capture and intake

Two local Chrome 157 runs used isolated copies of the 52,376-reference mixed library with Node 26.13.1 and PostgreSQL 17 on the same arm64 Mac. Each run alternated five quiet and busy pairs. Each arm per pair opened the sparse project dashboard search three times and advanced to page two. Timing starts before navigation and ends when the first image decodes. A warmup visited the same pages, and the browser context and server thumbnail cache were reused. Each busy arm queued three distinct example.com URLs and submitted eight screenshots totaling 24,964,953 bytes. The harness sampled whether a job was running and whether the upload was still pending immediately before each browser navigation.

| Run and action | Quiet median (range) | Busy median (range) |
| --- | ---: | ---: |
| Run 1, first preview | 183 ms (161–569) | 207 ms (163–627) |
| Run 1, page two preview | 187 ms (175–295) | 196 ms (170–286) |
| Run 2, first preview | 229 ms (169–351) | 266 ms (169–408) |
| Run 2, page two preview | 236 ms (165–299) | 255 ms (169–368) |

Each cell represents 15 visits. Capture was running at navigation start for 28 of 30 busy visits and intake was pending for 16. Both runs showed higher busy medians with overlapping ranges. These data describe the tested workload with one browser session, one capture worker and one upload at a time. They do not quantify peak resource use or Railway performance. All expected responses and image decodes passed. Browser-generated navigation cancellations were excluded from request failure tracking.

Both runs recovered a claimed job after killing the worker. A subsequent retry completed with one screenshot on that reference. The second run also verified manual screenshot recovery after an injected capture failure. It used the current migrations and included category memberships and upload receipts in the restore. Raw measurements and restore counts are in `2026-11-13-busy-library.json`.

To reproduce, clone a populated disposable extended-gallery database into a new `taste_gallery_bench_busy<suffix>` database, migrate it, and copy its image directory to a fresh location. Run `node tests/busy-library.mjs` after building with `DATABASE_URL`, `TASTE_STORAGE_DIR`, and `CHROME_PATH` set. This run adds references and contacts example.com with the real capture worker.
