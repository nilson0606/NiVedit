# Third-party components

| Component | Use | License |
| --- | --- | --- |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | Bundled MP4 muxing | [MIT](licenses/mp4-muxer.txt) |
| [webm-muxer](https://github.com/Vanilagy/webm-muxer) | Bundled WebM muxing | [MIT](licenses/webm-muxer.txt) |
| [MP4Box.js](https://github.com/gpac/mp4box.js) | Bundled MP4/MOV demuxing | [BSD 3-Clause](licenses/mp4box.txt) |
| [OpenCC](https://github.com/BYVoid/OpenCC) | Embedded conversion dictionary data, adapted for browser use in `48_s2t.js` | [Apache 2.0](licenses/OpenCC.txt) |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Downloaded AI subtitle runtime | [Apache 2.0](licenses/transformers.js.txt) |

The bundled libraries retain the v9.1 editor versions. This publication does not upgrade dependencies. Downloaded models and runtime dependencies have their own upstream license terms.

## Background music (current v2 library; archived v3 and v4)

The original NiVedit arrangements are rendered with **GeneralUser GS v2.0.3** by S. Christian Collins. Its [license](licenses/GeneralUser-GS.txt) permits music production; the original full terms and provenance notes are also included with the MP3 download. The SoundFont itself is not delivered to the browser.

Production tools: [TinySoundFont / tinysoundfont](https://github.com/nwhitehead/tinysoundfont-pybind) (MIT), NumPy, and ffmpeg. These tools are not bundled into the editor. SoundFont source, pinned commit and checksum are recorded under nivedit-src/tools/music-v2-notices/.

The additional **Cheerful example music** track is the original project audio, explicitly authorized by the user on 2026-09-17. It is preserved byte-for-byte and is separate from the 40 GeneralUser GS arrangements in the current library. Historical v3 and v4 files remain at their original URLs for archival compatibility; see example-provenance.json in the download.


## Optional video compatibility converter (v12.5)

The unmodified UMD JavaScript and WebAssembly from **@ffmpeg/core 0.12.10** are loaded on demand in a separate Worker. This single-thread core is licensed **GPL-2.0-or-later**, not the MIT license of the wrapper package. Full license and corresponding release source/build archives are provided alongside the binary payload at [video-compat/README.html](docs/video-compat/README.html). Hashes and exact upstream release commit are recorded in its manifest and source index. Individual library notices remain in the source archives.

The file-compatible base64 wrapper does not change core bytes; tools/unpack_compat_core.py recovers and verifies the original JS/WASM. The application invokes the core through a local worker message interface. User media is never uploaded for conversion.
