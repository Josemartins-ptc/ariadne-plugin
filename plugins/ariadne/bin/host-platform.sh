# Sourced by plugin/bin/ariadne and scripts/build-plugin.sh: the single mapping from
# the host to the name of its binary directory (<os>-<arch>). POSIX sh.

OS_DARWIN="darwin"
OS_LINUX="linux"
ARCH_AARCH64="aarch64"
ARCH_X86_64="x86_64"
UNSUPPORTED_EXIT=1

# Prints the host's <os>-<arch>. On an unsupported host prints one line on stderr and
# returns UNSUPPORTED_EXIT (never 2: Claude Code reads exit 2 from a hook as "block").
host_platform() {
    host_os=$(uname -s 2>/dev/null) || host_os=
    host_machine=$(uname -m 2>/dev/null) || host_machine=
    if [ -z "$host_os" ] || [ -z "$host_machine" ]; then
        echo "ariadne: cannot determine the platform: uname is missing or failed" >&2
        return "$UNSUPPORTED_EXIT"
    fi
    case "$host_os" in
        Darwin) platform_os=$OS_DARWIN ;;
        Linux) platform_os=$OS_LINUX ;;
        *)
            echo "ariadne: unsupported operating system '$host_os' (supported: macOS, Linux)" >&2
            return "$UNSUPPORTED_EXIT"
            ;;
    esac
    case "$host_machine" in
        arm64 | aarch64) platform_arch=$ARCH_AARCH64 ;;
        x86_64 | amd64) platform_arch=$ARCH_X86_64 ;;
        *)
            echo "ariadne: unsupported architecture '$host_machine' (supported: aarch64, x86_64)" >&2
            return "$UNSUPPORTED_EXIT"
            ;;
    esac
    echo "$platform_os-$platform_arch"
}
