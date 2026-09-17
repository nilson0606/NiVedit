# Music pack v2 production
The 40 new compositions are rendered with GeneralUser GS v2.0.3 sampled instruments.
The SoundFont is not bundled into the website or the source archive. The music-production license is included here and in the MP3 ZIP.
Pinned upstream commit and SHA-256: provenance.json.
Download GeneralUser-GS.sf2 from that commit of https://github.com/mrbumpy409/GeneralUser-GS.
Install numpy and tinysoundfont==0.3.7 in a Python 3.12 environment; ffmpeg must support libmp3lame.
Run tools/build_music_pack_v2.py --ffmpeg PATH --soundfont PATH --license PATH.
The generator writes local MP3s to assets/music_pack_40_v2 and staged catalog/payloads to qa-music-v2.
After validation, copy the staged catalog to src/28_music_catalog.js and payloads to music-assets/.
Original v1 payload URLs are retained for clients with an older cached HTML; the current catalog exposes only 40 v2 tracks.
Normal editor builds need only Python's standard library and the checked-in generated assets.
