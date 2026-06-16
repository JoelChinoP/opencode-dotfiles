#!/usr/bin/env bash
# Exposes OpenCode on the LAN for the current boot/session only.
# Reboot/shutdown clears the manual process and non-persistent firewall rule.
set -euo pipefail

PORT="${OPENCODE_SERVE_PORT:-4096}"
WORKDIR="${OPENCODE_WORKDIR:-code}"
PIDFILE="/tmp/opencode-serve-lan.pid"
LOGFILE="/tmp/opencode-serve-lan.log"

if [[ "$WORKDIR" != /* ]]; then
    WORKDIR="$HOME/$WORKDIR"
fi

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "ERROR: falta el comando '$1'." >&2
        exit 1
    }
}

firewall_open() {
    if command -v iptables >/dev/null 2>&1; then
        if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
            sudo iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
        fi
        echo "Firewall temporal: permitido TCP/$PORT con iptables."
    else
        echo "Aviso: iptables no existe; no se agrego regla de firewall."
    fi
}

firewall_close() {
    if command -v iptables >/dev/null 2>&1; then
        while sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; do
            sudo iptables -D INPUT -p tcp --dport "$PORT" -j ACCEPT
        done
        echo "Firewall temporal: removida regla TCP/$PORT."
    fi
}

start_server() {
    need_cmd opencode
    mkdir -p "$WORKDIR"

    if systemctl --user is-active opencode-serve >/dev/null 2>&1; then
        systemctl --user stop opencode-serve
    fi

    if systemctl is-active opencode-serve >/dev/null 2>&1; then
        echo "Deteniendo opencode-serve permanente para liberar :$PORT..."
        sudo systemctl stop opencode-serve
    fi

    if ss -tln "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
        echo "ERROR: ya hay algo escuchando en :$PORT." >&2
        ss -tlnp "sport = :$PORT" || true
        exit 1
    fi

    setsid bash -lc "
        cd '$WORKDIR'
        if [ -f \"\$HOME/.config/opencode/skills-env.sh\" ]; then
            . \"\$HOME/.config/opencode/skills-env.sh\"
        fi
        exec opencode serve --hostname 0.0.0.0 --port '$PORT'
    " </dev/null >"$LOGFILE" 2>&1 &

    echo $! >"$PIDFILE"
    sleep 2

    if ! ss -tln "sport = :$PORT" 2>/dev/null | grep -q "0.0.0.0:$PORT"; then
        echo "ERROR: OpenCode no quedo escuchando en 0.0.0.0:$PORT." >&2
        tail -n 80 "$LOGFILE" >&2 || true
        exit 1
    fi

    firewall_open

    lan_ip="$(ip -4 addr show scope global 2>/dev/null | awk '$1 == "inet" && $2 !~ /^(172\\.|10\\.|192\\.168\\.(1[6-9]|2[0-9]|3[0-1])\\.)/ { sub(/\\/.*$/, \"\", $2); print $2; exit }')"
    if [ -z "${lan_ip:-}" ]; then
        lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
    fi

    echo ""
    echo "OpenCode expuesto temporalmente:"
    echo "  PID: $(cat "$PIDFILE")"
    echo "  URL: http://${lan_ip:-TU_IP_LAN}:$PORT/"
    echo "  Log: $LOGFILE"
    echo ""
    echo "Para cerrar antes de reiniciar:"
    echo "  $0 stop"
}

stop_server() {
    firewall_close

    if [ -f "$PIDFILE" ]; then
        pid="$(cat "$PIDFILE")"
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "OpenCode temporal detenido: PID $pid."
        fi
        rm -f "$PIDFILE"
    else
        pkill -u "$(id -un)" -f "opencode serve --hostname 0.0.0.0 --port $PORT" 2>/dev/null || true
    fi

    echo "Si quieres volver al servicio local normal ahora:"
    echo "  sudo systemctl start opencode-serve"
}

case "${1:-start}" in
    start) start_server ;;
    stop) stop_server ;;
    status)
        ss -tlnp "sport = :$PORT" || true
        [ -f "$LOGFILE" ] && tail -n 20 "$LOGFILE" || true
        ;;
    *)
        echo "Uso: $0 [start|stop|status]" >&2
        exit 2
        ;;
esac
