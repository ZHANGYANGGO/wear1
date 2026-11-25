"""Download the two official DCT-Net styles from ModelScope, verifying each graph."""
import hashlib
import os
import tempfile
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(os.environ.get("WEARMATE_CARTOON_MODEL_DIR") or Path(__file__).resolve().parents[1] / "models" / "dct-net")
STYLES = {
    "anime": ("cv_unet_person-image-cartoon_compound-models", {
        "head": "338e7bf7ab4014ba9da864c2dda104f26d8af6c7f468038782d92ccc8e2dedda",
        "context": "71efec51b4566cce3a3123822fb4e17794ad062c3e324b33f2a65df850c037ad"}),
    "handdrawn": ("cv_unet_person-image-cartoon-handdrawn_compound-models", {
        "head":"b5c8c54cfc96420feacdde140c7c81c3b8e6612162d58bc70a6fd4d35b340ce2",
        "context":"fc1553a316698b1e7fa85a286bd2994e29ae8ece233004cb42192b5b17accc64"})
}


def download():
    ROOT.mkdir(parents=True,exist_ok=True)
    for style,(repo,digests) in STYLES.items():
        for part,digest in digests.items():
            dest = ROOT / f"{style}-{part}.pb"
            if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == digest:
                print("OK",dest.name);continue
            name = "cartoon_h.pb" if part == "head" else "cartoon_bg.pb"
            url = f"https://www.modelscope.cn/models/damo/{repo}/resolve/master/{name}"
            with urlopen(url,timeout=120) as response:
                graph = response.read(8_000_000)
            if hashlib.sha256(graph).hexdigest() != digest:
                raise ValueError(f"Checksum mismatch for {dest.name}")
            with tempfile.NamedTemporaryFile(dir=ROOT,delete=False) as temp:
                temp.write(graph)
            os.replace(temp.name,dest)
            print("Verified",dest.name,flush=True)


if __name__ == "__main__":
    download()
