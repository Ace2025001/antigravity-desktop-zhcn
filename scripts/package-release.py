"""Write ordinary UTF-8 ZIPs readable by Windows Explorer and macOS Archive Utility."""
import pathlib
import stat
import sys
import zipfile

source = pathlib.Path(sys.argv[1]).resolve(strict=True)
destination = pathlib.Path(sys.argv[2]).resolve()
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED,
                     compresslevel=6, allowZip64=False) as archive:
    for file in [source, *sorted(source.rglob("*"))]:
        # npm's developer command shims are not used by the bundled launchers.
        relative = file.relative_to(source)
        if ("node_modules", ".bin") in zip(relative.parts, relative.parts[1:]):
            continue
        if file.is_symlink():
            raise ValueError(f"Refusing symlink: {file}")
        name = file.relative_to(source.parent).as_posix()
        directory = file.is_dir()
        info = zipfile.ZipInfo(name + ("/" if directory else ""))
        info.create_system = 3
        executable = file.suffix in (".command", ".sh") or name.endswith("mac启动/配套程序/node")
        mode = (stat.S_IFDIR | 0o755) if directory else (stat.S_IFREG | (0o755 if executable else 0o644))
        info.external_attr = (mode << 16) | (0x10 if directory else 0)
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, b"" if directory else file.read_bytes())
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise ValueError("ZIP verification failed")
print(destination)
