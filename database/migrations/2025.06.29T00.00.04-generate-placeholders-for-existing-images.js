"use strict";

const FILES_TABLE = "files";
const BATCH_SIZE = 50;
const fs = require("fs");
const path = require("path");

async function up(trx) {
  try {
    console.log("=== MIGRATION START ===");
    console.log("Current working directory:", process.cwd());

    // Check if table exists
    console.log("Checking if table exists...");
    const tableExists = await trx.schema.hasTable(FILES_TABLE);
    console.log(`Table ${FILES_TABLE} exists: ${tableExists}`);

    if (!tableExists) {
      console.error(`Table ${FILES_TABLE} does not exist`);
      return;
    }

    // Check if placeholder column exists
    console.log("Checking if placeholder column exists...");
    const hasPlaceholderColumn = await trx.schema.hasColumn(
      FILES_TABLE,
      "placeholder"
    );
    console.log(`Placeholder column exists: ${hasPlaceholderColumn}`);

    if (!hasPlaceholderColumn) {
      console.log("Adding placeholder column...");
      await trx.schema.alterTable(FILES_TABLE, (table) => {
        table.text("placeholder").nullable();
      });
      console.log("Placeholder column successfully added");
    }

    let lastId = 0;
    let processedCount = 0;
    let skippedCount = 0;
    let totalFiles = 0;

    // Сначала посчитаем общее количество файлов
    const totalFilesResult = await trx
      .count("* as count")
      .from(FILES_TABLE)
      .whereNot("url", null)
      .andWhereLike("mime", "image/%")
      .andWhere("placeholder", null);

    totalFiles = totalFilesResult[0].count;
    console.log(`Total files to process: ${totalFiles}`);

    while (true) {
      console.log(`\n--- Processing batch starting from ID: ${lastId} ---`);

      const files = await trx
        .select(["id", "url", "hash", "ext", "provider", "mime"])
        .from(FILES_TABLE)
        .whereNot("url", null)
        .andWhereLike("mime", "image/%")
        .andWhere("placeholder", null)
        .andWhere("id", ">", lastId)
        .orderBy("id", "asc")
        .limit(BATCH_SIZE);

      console.log(
        `Found ${files.length} files to process (${
          processedCount + skippedCount
        }/${totalFiles} total)`
      );

      if (files.length === 0) {
        console.log(
          `Migration completed. Total processed: ${processedCount}, skipped: ${skippedCount}`
        );
        break;
      }

      for (const file of files) {
        console.log(`\n--- Processing file ID: ${file.id} ---`);
        console.log("File data:", {
          id: file.id,
          url: file.url,
          provider: file.provider,
          mime: file.mime,
          ext: file.ext,
        });

        try {
          // Skip unsupported providers
          if (file.provider && file.provider !== "local") {
            console.warn(
              `Skipping file ${file.id} - provider "${file.provider}" not supported`
            );
            skippedCount++;
            continue;
          }

          // Check if file exists on disk
          const filePath = path.join(process.cwd(), "public", file.url);
          console.log("Checking file path:", filePath);

          if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}, skipping...`);
            skippedCount++;
            continue;
          }

          // Проверяем размер файла (максимум 10MB)
          const stats = fs.statSync(filePath);
          const fileSizeMB = stats.size / (1024 * 1024);

          if (fileSizeMB > 10) {
            console.warn(
              `File too large: ${fileSizeMB.toFixed(2)}MB, skipping...`
            );
            skippedCount++;
            continue;
          }

          console.log(
            "File exists on disk ✓, size:",
            `${fileSizeMB.toFixed(2)}MB`
          );

          // Generate placeholder using direct plaiceholder import
          let placeholder = null;

          try {
            console.log("Generating placeholder with plaiceholder...");

            // Читаем файл в Buffer для plaiceholder 3.0.0
            const imageBuffer = fs.readFileSync(filePath);
            console.log("File read into buffer, size:", imageBuffer.length);

            // Добавляем таймаут для plaiceholder
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error("Plaiceholder timeout after 10 seconds"));
              }, 10000);
            });
            // Прямой импорт plaiceholder вместо использования плагина
            const { getPlaiceholder } = require("plaiceholder");
            const plaiceholderPromise = getPlaiceholder(imageBuffer, {
              size: 10,
            });
            const { base64 } = await Promise.race([
              plaiceholderPromise,
              timeoutPromise,
            ]);

            placeholder = base64;

            console.log(`✓ Generated placeholder for file ${file.id}`);
            console.log(
              "Placeholder length:",
              placeholder ? placeholder.length : "null"
            );
          } catch (plaiceholderError) {
            console.error(
              `Plaiceholder error for file ${file.id}:`,
              plaiceholderError.message
            );

            // Попробуем fallback с sharp
            try {
              console.log("Trying sharp fallback...");
              const sharp = require("sharp");

              const imageBuffer = fs.readFileSync(filePath);
              const placeholderBuffer = await sharp(imageBuffer)
                .resize(10, 10, { fit: "cover" })
                .jpeg({ quality: 50 })
                .blur(0.5)
                .toBuffer();

              placeholder = `data:image/jpeg;base64,${placeholderBuffer.toString(
                "base64"
              )}`;
              console.log(
                `✓ Generated fallback placeholder for file ${file.id}`
              );
            } catch (sharpError) {
              console.error(
                `Sharp fallback also failed for file ${file.id}:`,
                sharpError.message
              );
              skippedCount++;
              continue;
            }
          }

          if (placeholder) {
            console.log("Updating database with placeholder...");
            await trx
              .update("placeholder", placeholder)
              .from(FILES_TABLE)
              .where("id", file.id);
            processedCount++;
            console.log(`✓ Updated database for file ${file.id}`);
          } else {
            console.warn(`No placeholder generated for file ${file.id}`);
            skippedCount++;
          }
        } catch (error) {
          console.error(`Error processing file ${file.id}:`, error.message);
          console.error("Full error:", error);
          skippedCount++;
        }
      }

      lastId = files[files.length - 1].id;
      console.log(`\n--- Batch completed. Last ID: ${lastId} ---`);
    }

    console.log("\n=== MIGRATION COMPLETE ===");
    console.log(
      `Final stats: processed: ${processedCount}, skipped: ${skippedCount}`
    );
  } catch (error) {
    console.error("=== MIGRATION ERROR ===");
    console.error("Migration error:", error);
    console.error("Full error stack:", error.stack);
    throw error;
  }
}

async function down() {
  console.log("Down migration: keeping placeholder column and data");
  // Ничего не делаем - оставляем поле и данные
}

module.exports = { up, down };
