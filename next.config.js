/** @type {import('next').NextConfig} */
const [repositoryOwner, repositoryName] = (process.env.GITHUB_REPOSITORY || "").split("/");
const inferredBasePath = repositoryName && repositoryName !== `${repositoryOwner}.github.io`
  ? `/${repositoryName}`
  : "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? inferredBasePath;

module.exports = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};
