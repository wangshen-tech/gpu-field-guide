# GPU Field Guide

An English, CUDA-first learning guide for AI infrastructure engineers. Start with one GPU, then connect architecture and performance to training, inference and production operations.

- 20 learning modules with 20 labs, knowledge-check quizzes and primary-source references.
- Three interactive tools: memory budget, roofline explorer and GPU architecture explorer.
- Search, learning paths, interview preparation and completion progress saved in your browser.
- Responsive static HTML, CSS and JavaScript. No build step, package installation, backend or account is required.

Basic Python, command-line familiarity and introductory machine learning are helpful prerequisites. Reading the guide and using its conceptual tools require no GPU. CUDA exercises require a compatible NVIDIA GPU and the dependencies stated in the lesson; CPU-only examples can be explored separately.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open [localhost:8000](http://localhost:8000). The website itself has no Python dependency; Python only provides a convenient development server. Any static web server can serve `dist/`.

## Publish with GitHub Pages

The included workflow uploads `dist/` and deploys it on pushes to `main` or a manual run.

1. In the `gpu-field-guide` repository, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Open **Actions → Deploy GPU Field Guide → Run workflow**, selecting `main`, or push a change to `main`.
4. Use the website URL shown in the deployment result. A project repository normally publishes at `https://OWNER.github.io/gpu-field-guide/`.

The workflow uses the official [checkout action](https://github.com/actions/checkout/tree/v4), [Pages artifact uploader](https://github.com/actions/upload-pages-artifact/tree/v3) and [Pages deployment action](https://github.com/actions/deploy-pages/tree/v4), with the permissions and environment described in [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Content and assumptions

Lessons are original educational synthesis with links to official documentation and research. They cover a broad practical curriculum, not every architecture, vendor or specialization. Check linked documentation against your installed versions before using a command or API.

GPU labs were not executed on the user's hardware. Calculator outputs and simulated examples are estimates for learning, not measured device performance. Hardware-dependent experiments should be run in an environment you control, with correctness and resource limits appropriate to the workload.

Completion progress uses browser local storage and stays on that browser and site origin. It does not sync between devices or between a local preview and the hosted site. Clearing site data clears progress. Google Fonts are requested externally for typography; system-font fallbacks keep the guide usable when that optional network request is unavailable.

Edit lesson data in `dist/data/`, behavior in `dist/app.js`, styles in `dist/styles.css`, and the page shell in `dist/index.html`. Commit `dist/` directly; it is the deployable site.
