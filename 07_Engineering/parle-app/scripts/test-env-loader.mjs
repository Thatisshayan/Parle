const clientModuleUrl = new URL("../src/lib/superdev/client.ts", import.meta.url).href;
const testEnvExpression = '({ VITE_APP_ID: "parle-test-app", VITE_SUPERDEV_BASE_URL: "https://parle-test.invalid" })';

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);

  if (url !== clientModuleUrl || loaded.source == null) {
    return loaded;
  }

  const source = typeof loaded.source === "string"
    ? loaded.source
    : Buffer.from(loaded.source).toString("utf8");

  return {
    ...loaded,
    source: source.replaceAll("import.meta.env", testEnvExpression),
  };
}
