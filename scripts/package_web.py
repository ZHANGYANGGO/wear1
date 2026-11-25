"""Package one standalone game for static hosting."""

from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    name = "厨房营业-网页版"
    root = Path(__file__).resolve().parents[1]
    page = (root / (name + ".html")).read_bytes()
    target = root / (name + ".zip")
    with NamedTemporaryFile(dir=root, suffix=".zip", delete=False) as temporary:
        path = Path(temporary.name)
    try:
        with ZipFile(path, "w", ZIP_DEFLATED) as archive:
            archive.writestr("index.html", page)
        path.replace(target)
    finally:
        path.unlink(missing_ok=True)
    print(target.name)


if __name__ == "__main__":
    main()
