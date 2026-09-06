"""
Rebuild personal_cfo_app_final.html (Claude Artifact) and index.html (GitHub
Pages) by splicing the current app.css / engine.js / ui.js into the <style>
and <script> blocks of each target file.

This used to be a bare regex-substitute-and-write script: any silent typo in
one of the source files (a JS syntax error, an accidentally-emptied file, a
source that no longer matched the expected shape) would still "succeed" and
get shipped straight into a live personal-finance app. Everything below is
about turning that into a loud failure *before* any target file is touched.

personal_cfo_app_final.html (the Claude Artifact copy) only exists in the
dev scratchpad, not in this repo -- a plain GitHub Pages checkout only ever
has index.html. Any target in TARGETS that isn't present on disk is skipped
with a note instead of failing the build, so this same script works
unmodified in both places. Building must still produce at least one output.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

# Prefer this sandbox's known node install, but fall back to whatever's on
# PATH (a contributor's machine, a different CI image) rather than assuming
# one exact absolute path is the only place node could ever live.
NODE_BIN = "/opt/node22/bin/node" if os.path.isfile("/opt/node22/bin/node") else shutil.which("node")
SOURCES = {"css": "app.css", "engine": "engine.js", "ui": "ui.js"}
TARGETS = ["personal_cfo_app_final.html", "index.html"]

# A build that shrinks a source file to a sliver of its last known size is
# almost certainly a mistake (a bad edit, a botched copy-paste), not an
# intentional change -- catch it instead of shipping it.
MIN_SIZE = {"css": 500, "engine": 2000, "ui": 5000}

# Cheap content sanity checks: markers that should always be present in a
# well-formed source file. Not exhaustive -- just enough to catch "this file
# got truncated" or "this is the wrong file" before it goes any further.
CONTENT_MARKERS = {
    "engine": ["class Engine"],
    "ui": ["const UI", "esc(", "escJsArg("],
}

style_re = re.compile(r"(<style>)(.*?)(\n</style>)", re.DOTALL)
script_re = re.compile(r"(<script>)(.*?)(\n</script>)", re.DOTALL)


def fail(msg):
    print("BUILD FAILED:", msg, file=sys.stderr)
    sys.exit(1)


def read(p):
    if not os.path.isfile(p):
        fail(p + ": file not found")
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def check_js_syntax(name, src):
    """Run the JS through `node --check` so a typo is caught here, not by a
    user's browser console after the page has already shipped. This is the
    one safety net standing between a broken edit and a shipped page, so a
    missing node is a hard failure by default, not a silently-skipped check
    -- set SKIP_JS_SYNTAX_CHECK=1 to explicitly opt out (e.g. a machine that
    genuinely has no node available) instead of that happening unnoticed."""
    if not NODE_BIN:
        if os.environ.get("SKIP_JS_SYNTAX_CHECK"):
            print("  (SKIP_JS_SYNTAX_CHECK set: skipping syntax check for " + name + " -- node not found)")
            return
        fail(
            "node not found (checked /opt/node22/bin/node and PATH) -- can't syntax-check "
            + name + ". Install node, or set SKIP_JS_SYNTAX_CHECK=1 to build without this check."
        )
    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", encoding="utf-8", delete=False) as tmp:
        tmp.write(src)
        tmp_path = tmp.name
    try:
        result = subprocess.run([NODE_BIN, "--check", tmp_path], capture_output=True, text=True)
        if result.returncode != 0:
            fail(name + ": JavaScript syntax error --\n" + result.stderr)
    finally:
        os.unlink(tmp_path)


def validate_source(key, src):
    path = SOURCES[key]
    if not src.strip():
        fail(path + ": file is empty")
    if len(src) < MIN_SIZE[key]:
        fail(
            path + ": only " + str(len(src)) + " bytes (expected at least "
            + str(MIN_SIZE[key]) + ") -- looks truncated, refusing to build"
        )
    for marker in CONTENT_MARKERS.get(key, []):
        if marker not in src:
            fail(path + ": missing expected marker " + repr(marker) + " -- wrong file or bad edit?")


def splice(html, path, css, engine, ui):
    m = style_re.search(html)
    if not m:
        fail(path + ": no <style> block found")
    new_html = html[: m.start(2)] + css + html[m.end(2) :]

    scripts = list(script_re.finditer(new_html))
    if len(scripts) != 4:
        fail(path + ": expected 4 <script> blocks, found " + str(len(scripts)))
    # [0] sw-registration (untouched), [1] engine.js, [2] ui.js, [3] init (untouched)
    # Replace from the end backwards so earlier match offsets stay valid.
    for idx, new_body in [(2, ui), (1, engine)]:
        s = scripts[idx]
        new_html = new_html[: s.start(2)] + new_body + new_html[s.end(2) :]

    return new_html


def validate_output(path, original_html, new_html):
    # Structure must still be exactly what we expect post-splice.
    if len(style_re.findall(new_html)) != 1:
        fail(path + ": post-build sanity check failed (style block count changed)")
    if len(script_re.findall(new_html)) != 4:
        fail(path + ": post-build sanity check failed (script block count changed)")
    # A build that comes out drastically smaller than the input is almost
    # certainly a mistake (e.g. a source file was accidentally emptied and
    # slipped past the earlier per-source check because the math still added
    # up some other way). Allow real shrinkage, just not a collapse.
    if len(new_html) < len(original_html) * 0.5:
        fail(
            path + ": output is suspiciously small (" + str(len(new_html))
            + " bytes vs " + str(len(original_html)) + " before) -- refusing to write"
        )


def atomic_write(path, content):
    """Write to a temp file in the same directory and rename over the
    target, so a crash mid-write never leaves a half-written file behind."""
    d = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp_path = tempfile.mkstemp(dir=d, prefix=".rebuild-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def main():
    print("Reading and validating sources...")
    sources = {}
    for key, path in SOURCES.items():
        src = read(path)
        validate_source(key, src)
        sources[key] = src
    print("  " + SOURCES["css"] + ": " + str(len(sources["css"])) + " bytes")
    print("  " + SOURCES["engine"] + ": " + str(len(sources["engine"])) + " bytes")
    print("  " + SOURCES["ui"] + ": " + str(len(sources["ui"])) + " bytes")

    print("Checking JS syntax...")
    check_js_syntax("engine.js", sources["engine"])
    check_js_syntax("ui.js", sources["ui"])
    print("  OK")

    present_targets = []
    for path in TARGETS:
        if os.path.isfile(path):
            present_targets.append(path)
        else:
            print("  (skipping " + path + ": not present in this checkout)")
    if not present_targets:
        fail("none of " + ", ".join(TARGETS) + " were found -- nothing to build")

    built = {}
    for path in present_targets:
        html = read(path)
        new_html = splice(html, path, sources["css"], sources["engine"], sources["ui"])
        validate_output(path, html, new_html)
        built[path] = new_html

    # Only write once every target has built and validated cleanly -- a
    # failure on the second target should never leave the first one written
    # from a half-finished run.
    for path, new_html in built.items():
        atomic_write(path, new_html)
        print("rebuilt", path, len(new_html), "bytes")


if __name__ == "__main__":
    main()
