# Contributing to Tipeline

Thanks for helping improve Tipeline. Bug reports, ideas, docs fixes and pull requests are
all welcome.

## Before your first pull request: sign the CLA

Every contributor signs the [Contributor License Agreement](CLA.md) once. When you open your
first pull request, the CLA bot will comment with instructions; reply with the statement it
asks for and you are done. You keep the copyright in your work. The CLA gives the project
the rights it needs to distribute your contribution, including under other licenses in
the future.

**Contributing for your employer?** If your company may own the code you write (most
employment agreements say it does), your company also needs to sign the
[Corporate CLA](CLA-CORPORATE.md) and list you as a designated employee. Until it does, we
can't merge your pull request.

## Development

You need **Node.js 24** (see `.nvmrc`). Browser actions also need Chrome or Chromium, and
audio and video actions need ffmpeg.

The [developer setup guide](apps/docs/internals/setup.md) covers building, running and testing.
[CLAUDE.md](CLAUDE.md) has the repository layout, commands and code style. In short:

```bash
npm install
npm run build
npm test
```

Use Prettier formatting (`npm -w apps/core run format`) and keep each pull request focused
on one change.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE) and the terms of the [CLA](CLA.md). The Tipeline name and logo
are covered by the [trademark policy](TRADEMARKS.md).
