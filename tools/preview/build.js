// Builds preview.html: a fake HA kiosk that loads the real celebrations module.
const fs = require("fs");
const mdi = require("@mdi/js");

const ICONS = [
  "bed", "dog", "silverware-fork-knife", "toothbrush", "basket", "trash-can",
  "trophy", "star-face", "party-popper", "rocket-launch", "crown", "emoticon-excited",
  "medal", "arm-flex", "star", "fire", "check-bold", "trophy-variant", "check-all",
  "check", "volume-high", "volume-off", "creation",
];
const toKey = (n) => "mdi" + n.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const paths = {};
for (const n of ICONS) {
  if (!mdi[toKey(n)]) throw new Error("missing icon " + n);
  paths["mdi:" + n] = mdi[toKey(n)];
}

const moduleSrc = fs.readFileSync(process.argv[2], "utf8");
const template = fs.readFileSync(__dirname + "/preview.template.html", "utf8");
const out = template
  .replace("/*__ICON_PATHS__*/", `const ICON_PATHS = ${JSON.stringify(paths)};`)
  .replace("/*__CELEBRATIONS_MODULE__*/", () => moduleSrc);
fs.writeFileSync(process.argv[3], out);
console.log("wrote", process.argv[3], (out.length / 1024).toFixed(1) + " KB");
