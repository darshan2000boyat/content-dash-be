import simpleLogger from "simple-node-logger";
import fs from "fs";
const currentYear = new Date().getFullYear();
const dir = `public/logs/strapi_${currentYear}/`;
const logger = simpleLogger.createRollingFileLogger({
  logDirectory: dir,
  fileNamePattern: "strapi_log_<DATE>.log",
  dateFormat: "YYYY.MM.DD",
});
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
export default logger;
export { logger };
