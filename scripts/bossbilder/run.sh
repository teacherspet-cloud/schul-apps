#!/bin/sh
# Ein Bildauftrag über Codex mit dem ChatGPT-Abo der Lehrkraft (im Container schul-apps, als node).
# Aufruf: run.sh <name> [<referenzbild>]  – liest $B/<name>.txt, schreibt $B/out/<name>.png
# Gleiche Schalter wie die App (src/main/services/ai/cli.ts bildLauf/codexLeanArgs): sparsames Modell, wenig Nachdenken,
# nichts dauerhaft ablegen.
N="$1"; R="$2"
B="${BOSSBILD_DIR:?BOSSBILD_DIR fehlt}"
export CODEX_HOME="${BOSSBILD_CODEX_HOME:?}"
export HOME="${BOSSBILD_HOME:?}"
export NO_COLOR=1
W=$(mktemp -d); mkdir -p "$B/out"
echo "You create exactly one image with your image generation tool when asked. Do nothing else and answer briefly." > "$W/anweisungen.md"
D=""
for f in apps plugins remote_plugin plugin_sharing skill_search goals browser_use browser_use_external computer_use in_app_browser hooks personality tool_suggest mentions_v2 shell_tool unified_exec view_image workspace_dependencies sleep_tool multi_agent memories; do D="$D --disable $f"; done
{ printf 'Erzeuge mit deinem Bildgenerierungswerkzeug genau ein Bild nach dieser Beschreibung:\n\n'; cat "$B/$N.txt"; printf '\n\nAntworte nur kurz, nachdem das Bild erzeugt ist.\n'; } > "$W/prompt.txt"
cd "$W" || exit 1
I=""; [ -n "$R" ] && cp "$B/out/$R.png" "$W/ref.png" && I="--image $W/ref.png"
codex exec --skip-git-repo-check --ephemeral --sandbox read-only --color never --json $D \
  -c agents.enabled=false -c include_permissions_instructions=false -c include_environment_context=false \
  -c include_collaboration_mode_instructions=false -c include_skills_usage_instructions=false \
  -c include_plugin_usage_instructions=false -c include_apps_usage_instructions=false -c include_apps_instructions=false \
  -c 'history.persistence="none"' -c memories.generate_memories=false -c memories.use_memories=false \
  -c "log_dir=\"$W/.codex-log\"" -c "model_instructions_file=\"$W/anweisungen.md\"" \
  -c 'model_reasoning_effort="low"' --model gpt-5.6-luna $I - < "$W/prompt.txt" > "$W/aus.jsonl" 2>"$W/err.txt"
T=$(grep -o '"thread_id":"[^"]*"' "$W/aus.jsonl" | head -1 | cut -d'"' -f4)
G="$CODEX_HOME/generated_images/$T"
F=$(ls -t "$G"/* 2>/dev/null | head -1)
if [ -n "$T" ] && [ -n "$F" ]; then cp "$F" "$B/out/$N.png"; echo "OK $N"; else echo "FEHLT $N"; tail -c 700 "$W/aus.jsonl"; tail -c 500 "$W/err.txt"; fi
[ -n "$T" ] && rm -rf "$G"
cd / && rm -rf "$W"
