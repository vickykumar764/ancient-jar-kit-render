# Ancient Jar — kit (three.js toon) render on GitHub Actions: browser task brief

## What this is
The Ancient Jar Hindi Short (Zhang Heng seismoscope, 132 AD, 18-line Hindi script) is being rebuilt
in the Inspire Xplorer cartoon-audio-short KIT style (flat 2D toon characters in a low-poly 3D world,
the same engine as the Hindi Mountain Man video). The kit project lives locally at
`ricks-clips-ancient-jar-hindi/kit-jar/`. Its renderer is `render.mjs`: Playwright + SwiftShader,
1080x1920, renders each frame as a still (fresh page per frame). It is PROVEN locally — it already
rendered frames 0–499 (500 frames) on the VM before the user asked for it to move to Actions for
speed. The remaining 2,290 frames (500–2789) go to GitHub Actions in 20 parallel shards.

Do NOT use Kaggle or Colab for this: their T4 GPU cannot be used by the browser (no /dev/dri,
WebGL is always SwiftShader CPU), so they would not be faster. GitHub Actions parallel shards are
the fastest free route (proven on the Remotion 3D videos: Payeng 4.13 s/frame, Manjhi 6.1 s/frame).

## Files granted to this task
- `ancient-jar-kit-render.zip` (89,621 bytes, 17 entries) — the kit project WITHOUT node_modules,
  frames, stills, work, out, audio. Contains: `web/` (main.js, story.js, terrain.js, motion.js,
  paint.js, toonbase.js, cast.js, castdefs.js, toon.js, index.html, charsheet.html, jarsheet.html,
  package.json, package-lock.json), `render.mjs`, `timing.py`, `package.json` (root, playwright).
- This brief (contains the two workflow YAMLs verbatim below).

## Step 1 — create the repo
- github.com → New repository. Name: `ancient-jar-kit-render`. Description: "Ancient Jar Hindi
  short — Inspire Xplorer cartoon-audio-short kit (three.js toon) render, frames 500-2789, GitHub
  Actions". Visibility: **Public**. Do NOT initialise with README/.gitignore/license. Create it
  under the account **vickykumar764** (signed in already in this browser; do NOT create a new
  GitHub account).

## Step 2 — upload the zip, then unpack via Actions
- On the repo's main page use "Add file → Upload files" and upload `ancient-jar-kit-render.zip`
  (it is under 25 MB, so the web upload works). Commit it to main.
- The Actions token (GITHUB_TOKEN) CANNOT create or update workflow files — that is why both
  workflow files below are created via the web UI, never pushed by a workflow. So:
  - Create the helper workflow **via the web UI only**: "Add file → Create new file", path
    `.github/workflows/unpack-kit.yml`, paste the helper YAML below, commit to main.
  - The helper workflow unzips the zip, commits ONLY the extracted files (the zip contains NO
    .github folder, so nothing workflow-related is in the commit), then deletes the zip file AND
    deletes itself (`unpack-kit.yml`) in that same commit.
  - Run it (Actions tab → Unpack kit → Run workflow), wait for success, and verify the repo tree
    now shows `web/`, `render.mjs`, `timing.py`, `package.json`, and NO zip file and NO
    unpack-kit.yml.
- If the web upload of the zip fails for any reason, report the exact error and STOP — do not try
  another upload method on your own.

### Helper workflow `unpack-kit.yml` (create via web UI, verbatim)
```yaml
name: Unpack kit
on:
  workflow_dispatch:
jobs:
  unpack:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Unzip kit and commit
        run: |
          unzip -o ancient-jar-kit-render.zip
          rm ancient-jar-kit-render.zip
          rm -f .github/workflows/unpack-kit.yml
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add -A
          git commit -m "Unpack kit" || echo "nothing to commit"
          git push
```

## Step 3 — create the render workflow via the web UI, then run it
- Create with "Add file → Create new file" on the main branch, path
  `.github/workflows/render-kit.yml`. Copy the contents EXACTLY as below (no edits).
- The workflow has 20 matrix shards (frames 500–2789, 115 per shard except shard 19 with 105).
  Each shard: checkout → Node 24 → `npm install playwright@1.65.0` → `cd web && npm ci`
  (three.js 0.160) → `npx playwright install chromium --with-deps` → renders its range with
  `node render.mjs frames "<start>-<end>"` → verifies the frame count → uploads the shard's
  frames as artifact `kit-frames-shard-N` (retention 2 days).
- Run it (Actions tab → Render kit frames → Run workflow). Wait for completion. Expected: each
  shard ~40–50 min (115 frames at ~20–25 s/frame on SwiftShader + ~3 min setup); wall time
  ~45 min if all 20 run at once, ~1.5–2 h if only ~6–7 run concurrently (as observed before).
- If a shard FAILS: report the exact error and which shard, and STOP — do not re-run blindly. A
  single failed shard can be re-run with "Re-run failed jobs" once the cause is known.

### `.github/workflows/render-kit.yml` (create via web UI, verbatim)
```yaml
name: Render kit frames
on:
  workflow_dispatch:
jobs:
  render:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    permissions:
      contents: read
    strategy:
      fail-fast: false
      matrix:
        include:
          - shard: 0
            range: "500-614"
            count: 115
          - shard: 1
            range: "615-729"
            count: 115
          - shard: 2
            range: "730-844"
            count: 115
          - shard: 3
            range: "845-959"
            count: 115
          - shard: 4
            range: "960-1074"
            count: 115
          - shard: 5
            range: "1075-1189"
            count: 115
          - shard: 6
            range: "1190-1304"
            count: 115
          - shard: 7
            range: "1305-1419"
            count: 115
          - shard: 8
            range: "1420-1534"
            count: 115
          - shard: 9
            range: "1535-1649"
            count: 115
          - shard: 10
            range: "1650-1764"
            count: 115
          - shard: 11
            range: "1765-1879"
            count: 115
          - shard: 12
            range: "1880-1994"
            count: 115
          - shard: 13
            range: "1995-2109"
            count: 115
          - shard: 14
            range: "2110-2224"
            count: 115
          - shard: 15
            range: "2225-2339"
            count: 115
          - shard: 16
            range: "2340-2454"
            count: 115
          - shard: 17
            range: "2455-2569"
            count: 115
          - shard: 18
            range: "2570-2684"
            count: 115
          - shard: 19
            range: "2685-2789"
            count: 105
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Install Playwright
        run: npm install playwright@1.65.0
      - name: Install three.js
        run: cd web && npm ci
      - name: Install Chromium
        run: npx playwright install chromium --with-deps
      - name: Render shard
        run: node render.mjs frames "${{ matrix.range }}"
      - name: Verify frame count
        run: |
          n=$(ls frames/*.jpg | wc -l)
          echo "rendered $n frames, expected ${{ matrix.count }}"
          test "$n" -eq "${{ matrix.count }}"
      - name: Upload frames
        uses: actions/upload-artifact@v4
        with:
          name: kit-frames-shard-${{ matrix.shard }}
          path: frames/
          if-no-files-found: error
          retention-days: 2
```

## Step 4 — download the 20 shard artifacts (only after the run completes)
- Artifacts expire (retention 2 days set in the workflow; do not delay). Download all 20
  artifacts (`kit-frames-shard-0` … `kit-frames-shard-19`, each ~115 JPGs, ~35 MB, ~700 MB
  total) to the VM so the local agent can merge them with the local frames 0–499.
- If the wait for the run is too long for this browser session, STOP after Step 3 and report the
  run URL — the download will be a follow-up task. Do NOT leave the run unreported.
- Verify each downloaded artifact: it must contain the JPGs for its shard range
  (e.g. shard 0: f0500.jpg … f0614.jpg). Report any shard whose artifact is missing or short.

## Report back
Repo URL, run URL, per-shard status + measured s/frame, the 20 artifact names + sizes, and any
failures with their exact errors. If the run fails, say so plainly — the local render can be
resumed with `RESUME=1 node render.mjs frames "0-2789"` (frames 0–499 are kept locally).
