const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const webDir = path.join(rootDir, "web");

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(rootDir, filePath)}`);
  }
}

function parseJavaScript(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  new vm.Script(source, { filename: filePath });
}

function validateJavaScriptFiles() {
  const srcFiles = fs.readdirSync(srcDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(srcDir, name));
  const webFiles = [path.join(webDir, "app.js")];
  const files = [...srcFiles, ...webFiles];

  files.forEach(assertFileExists);
  files.forEach(parseJavaScript);

  return files.map((filePath) => path.relative(rootDir, filePath));
}

function validateWebAssets() {
  const indexPath = path.join(webDir, "index.html");
  const stylesPath = path.join(webDir, "styles.css");
  const appPath = path.join(webDir, "app.js");
  const html = fs.readFileSync(indexPath, "utf8");
  const appSource = fs.readFileSync(appPath, "utf8");

  assertFileExists(indexPath);
  assertFileExists(stylesPath);
  assertFileExists(appPath);

  if (!html.includes('href="/styles.css"')) {
    throw new Error("web/index.html is missing the /styles.css reference");
  }

  if (!html.includes('src="/app.js"')) {
    throw new Error("web/index.html is missing the /app.js reference");
  }

  const htmlIdMatches = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateHtmlIds = htmlIdMatches.filter(
    (id, index, values) => values.indexOf(id) !== index && values.indexOf(id) === index
  );
  if (duplicateHtmlIds.length > 0) {
    throw new Error(`web/index.html has duplicate id attributes: ${duplicateHtmlIds.join(", ")}`);
  }

  const htmlIds = new Set(htmlIdMatches);
  const domIdReferences = [
    ...appSource.matchAll(/document\.getElementById\((["'`])([^"'`]+)\1\)/g)
  ]
    .map((match) => match[2])
    .filter((id) => !id.includes("${"));
  const missingDomIds = domIdReferences.filter(
    (id, index, values) => !htmlIds.has(id) && values.indexOf(id) === index
  );

  if (missingDomIds.length > 0) {
    throw new Error(
      `web/app.js references missing HTML ids: ${missingDomIds.join(", ")}`
    );
  }
}

function main() {
  const validatedFiles = validateJavaScriptFiles();
  validateWebAssets();
  console.log(`Validated ${validatedFiles.length} JavaScript files and core web asset references.`);
}

try {
  main();
} catch (error) {
  console.error("Validation failed:");
  console.error(error.message || error);
  process.exit(1);
}
