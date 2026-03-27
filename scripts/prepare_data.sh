#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_URL_DEFAULT="https://drive.usercontent.google.com/download?id=1tdgarnn28CM01o9hbeKLUiJ1o1lskrqA&export=download&authuser=0&confirm=t&uuid=2481bd7f-f21f-42a5-bb24-a8067a17356f&at=AGN2oQ3yy0IH0i35n6R_CZShxh3Y%3A1773114478451"
EXTRA_URL_DEFAULT="xxx"
MAIN_ARCHIVE_FORMAT_DEFAULT="zip"
EXTRA_ARCHIVE_FORMAT_DEFAULT="7z"
EXPECTED_H5_COUNT_DEFAULT="5"
EXPECTED_JLD2_COUNT_DEFAULT="5"

MAIN_URL="${DATA_ARCHIVE_URL_MAIN:-$MAIN_URL_DEFAULT}"
EXTRA_URL="${DATA_ARCHIVE_URL_EXTRA:-$EXTRA_URL_DEFAULT}"
MAIN_ARCHIVE_FORMAT="${DATA_ARCHIVE_FORMAT_MAIN:-$MAIN_ARCHIVE_FORMAT_DEFAULT}"
EXTRA_ARCHIVE_FORMAT="${DATA_ARCHIVE_FORMAT_EXTRA:-$EXTRA_ARCHIVE_FORMAT_DEFAULT}"
EXPECTED_H5_COUNT="${EXPECTED_H5_COUNT:-$EXPECTED_H5_COUNT_DEFAULT}"
EXPECTED_JLD2_COUNT="${EXPECTED_JLD2_COUNT:-$EXPECTED_JLD2_COUNT_DEFAULT}"

DOWNLOAD_DIR="$ROOT_DIR/.downloads"
WORK_DIR="$DOWNLOAD_DIR/extracted"

mkdir -p "$DOWNLOAD_DIR" "$WORK_DIR" "$ROOT_DIR/data" "$ROOT_DIR/jldpath"

if ! command -v 7z >/dev/null 2>&1; then
    echo "未检测到 7z，请先安装后再执行。"
    echo "macOS 可执行: brew install p7zip"
    exit 1
fi

download_and_extract() {
    local url="$1"
    local name="$2"
    local fmt="$3"

    if [ -z "$url" ] || [ "$url" = "xxx" ]; then
        echo "跳过 $name：下载地址为空或仍是占位符。"
        return
    fi

    local archive="$DOWNLOAD_DIR/$name.$fmt"
    local target="$WORK_DIR/$name"

    mkdir -p "$target"

    echo "下载 $name ..."
    curl -L -C - "$url" -o "$archive"

    echo "解压 $name ..."
    rm -rf "$target"
    mkdir -p "$target"
    7z x -y "$archive" "-o$target" >/dev/null
}

download_and_extract "$MAIN_URL" "data_main" "$MAIN_ARCHIVE_FORMAT"
download_and_extract "$EXTRA_URL" "data_extra" "$EXTRA_ARCHIVE_FORMAT"

MAIN_SOURCE_DIR="$WORK_DIR/data_main/deepgtt-h5"
EXTRA_SOURCE_DIR="$WORK_DIR/data_extra/jldpath"

if [ ! -d "$MAIN_SOURCE_DIR" ]; then
    echo "主数据包缺少 deepgtt-h5 目录: $MAIN_SOURCE_DIR"
    echo "请确认主链接是 ZIP，且解压后目录结构为 deepgtt-h5/*.h5"
    exit 1
fi

if [ ! -d "$EXTRA_SOURCE_DIR" ]; then
    echo "补充数据包缺少 jldpath 目录: $EXTRA_SOURCE_DIR"
    echo "请确认补充链接是 7z，且解压后目录结构为 jldpath/*.jld2"
    exit 1
fi

copy_files() {
    local source_dir="$1"
    local pattern="$2"
    local dest="$3"
    while IFS= read -r file; do
        cp -f "$file" "$dest/"
    done < <(find "$source_dir" -type f -name "$pattern")
}

rm -f "$ROOT_DIR/data"/*.h5 "$ROOT_DIR/jldpath"/*.jld2

copy_files "$MAIN_SOURCE_DIR" "*.h5" "$ROOT_DIR/data"
copy_files "$EXTRA_SOURCE_DIR" "*.jld2" "$ROOT_DIR/jldpath"

H5_COUNT=$(find "$ROOT_DIR/data" -type f -name "*.h5" | wc -l | tr -d ' ')
JLD2_COUNT=$(find "$ROOT_DIR/jldpath" -type f -name "*.jld2" | wc -l | tr -d ' ')

if [ "$H5_COUNT" -lt "$EXPECTED_H5_COUNT" ]; then
    echo "H5 文件数量不足：期望 >= $EXPECTED_H5_COUNT，实际 $H5_COUNT"
    exit 1
fi

if [ "$JLD2_COUNT" -lt "$EXPECTED_JLD2_COUNT" ]; then
    echo "JLD2 文件数量不足：期望 >= $EXPECTED_JLD2_COUNT，实际 $JLD2_COUNT"
    exit 1
fi

echo "数据准备完成。"
echo "H5 文件目录: $ROOT_DIR/data"
echo "JLD2 文件目录: $ROOT_DIR/jldpath"
echo "H5 文件数量: $H5_COUNT"
echo "JLD2 文件数量: $JLD2_COUNT"
