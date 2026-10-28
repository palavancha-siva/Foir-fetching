// @ts-nocheck
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Pool } = require("pg");
const config = require("../config/options");
const { normalizeCsvRow } = require("../src/utils/csvParser");

const BANK_NAME_MAP = {
    "ADITYA BIRLA": "Aditya Birla Capital",
    "AXIS BANK": "Axis Bank",
    "Axis finance": "Axis Finance",
    "Bandhan bank": "Bandhan Bank",
    "Credit saison": "Credit Saison",
    "HDFC BANK": "HDFC Bank",
    "ICICI BANK": "ICICI Bank",
    "IDFC BANK": "IDFC First Bank",
    "INDUSIND BANK": "IndusInd Bank",
    "KOTAK": "Kotak Mahindra",
    "L&T": "L&T Finance",
    "MUTHOOT FIN": "Muthoot Finance",
    "TATA CAPITAL": "Tata Capital",
    "YES BANK": "Yes Bank"
};

function getBankNameFromFilename(filename) {
    const clean = filename
        .replace(/^ALL BANKS LISTING Updated \(\d+\)-/i, "")
        .replace(/\.csv$/i, "")
        .trim();
    for (const [key, val] of Object.entries(BANK_NAME_MAP)) {
        if (clean.toLowerCase().includes(key.toLowerCase())) {
            return val;
        }
    }
    return clean;
}

function findDownloadsFolder() {
    const dl = "C:/Users/DELL-LATTITUDE-5420/Downloads";
    if (!fs.existsSync(dl)) return null;
    const dirs = fs.readdirSync(dl).filter(d => d.startsWith("ALL BANKS LISTING"));
    if (dirs.length > 0) {
        return path.join(dl, dirs[0]);
    }
    return dl;
}

function parseCsvLine(line) {
    const fields = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const next = line[i + 1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === "," && !inQuotes) {
            fields.push(cur.trim());
            cur = "";
        } else {
            cur += c;
        }
    }
    fields.push(cur.trim());
    return fields;
}

async function importBankFile(filePath, client) {
    const filename = path.basename(filePath);
    if (!filename.endsWith(".csv") || filename.includes("Sheet1")) return;

    const bankName = getBankNameFromFilename(filename);
    console.log(`\n========================================`);
    console.log(`Processing: ${filename}`);
    console.log(`Bank: ${bankName}`);

    // Ensure bank exists in managed_banks
    await client.query(
        `INSERT INTO managed_banks (bank_name, active)
         VALUES ($1, 1)
         ON CONFLICT (LOWER(TRIM(bank_name))) WHERE active = 1 DO NOTHING`,
        [bankName]
    );

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers = null;
    let normalizedHeaders = null;
    let batch = [];
    let totalImported = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        if (!headers) {
            headers = parseCsvLine(line);
            normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
            continue;
        }

        const fields = parseCsvLine(line);
        const rawObj = {};
        for (let i = 0; i < normalizedHeaders.length; i++) {
            rawObj[normalizedHeaders[i]] = fields[i] || "";
        }

        const norm = normalizeCsvRow(rawObj, bankName);
        if (!norm.company_name) continue;

        batch.push({
            bank: norm.bank_name || bankName,
            company: norm.company_name,
            cat: norm.cat || "CAT B",
            foir: Number.isFinite(norm.foir) ? norm.foir : 70
        });

        if (batch.length >= 2500) {
            await insertBatch(batch, client);
            totalImported += batch.length;
            process.stdout.write(`  Imported ${totalImported} rows...\r`);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await insertBatch(batch, client);
        totalImported += batch.length;
    }

    console.log(`\n✓ Successfully loaded ${totalImported} companies for ${bankName}`);
}

async function insertBatch(batch, client) {
    if (batch.length === 0) return;

    // Deduplicate within the batch for mapping unique constraint (bank + company + cat)
    const map = new Map();
    for (const item of batch) {
        const key = `${item.bank.toLowerCase().trim()}|${item.company.toLowerCase().trim()}|${(item.cat || "").toLowerCase().trim()}`;
        map.set(key, item);
    }
    const deduped = Array.from(map.values());

    const compNames = deduped.map(b => b.company.trim());
    const bankNames = deduped.map(b => b.bank.trim());
    const cats = deduped.map(b => b.cat ? b.cat.trim() : null);
    const foirs = deduped.map(b => b.foir);

    // Bulk insert into managed_companies for autocomplete
    await client.query(`
        INSERT INTO managed_companies (company_name, active)
        SELECT DISTINCT c, 1
        FROM UNNEST($1::text[]) AS c
        WHERE TRIM(c) <> ''
        ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1 DO NOTHING
    `, [compNames]);

    // Bulk insert into company_bank_mappings
    await client.query(`
        INSERT INTO company_bank_mappings (company_name, bank_name, cat, foir, cc_obligation_percent, active)
        SELECT comp, bnk, c, f, 2, 1
        FROM UNNEST($1::text[], $2::text[], $3::text[], $4::numeric[]) AS t(comp, bnk, c, f)
        ON CONFLICT (LOWER(TRIM(company_name)), LOWER(TRIM(bank_name)), LOWER(TRIM(COALESCE(cat, ''))))
        WHERE active = 1
        DO UPDATE SET foir = EXCLUDED.foir, updated_at = NOW()
    `, [compNames, bankNames, cats, foirs]);

    // Deduplicate for bank_employer_catalog (bank + company)
    const catMap = new Map();
    for (const item of deduped) {
        const key = `${item.bank.toLowerCase().trim()}|${item.company.toLowerCase().trim()}`;
        catMap.set(key, item);
    }
    const catalogDeduped = Array.from(catMap.values());
    const catCompNames = catalogDeduped.map(b => b.company.trim());
    const catBankNames = catalogDeduped.map(b => b.bank.trim());
    const catCategories = catalogDeduped.map(b => b.cat ? b.cat.trim() : "CAT B");

    // Populate bank_employer_catalog table
    await client.query(`
        INSERT INTO bank_employer_catalog (bank_name, employer_name, employer_category, active)
        SELECT bnk, comp, c, 1
        FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(bnk, comp, c)
        ON CONFLICT (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
        WHERE active = 1
        DO UPDATE SET employer_category = EXCLUDED.employer_category, updated_at = NOW()
    `, [catBankNames, catCompNames, catCategories]);
}

async function main() {
    const targetDir = findDownloadsFolder();
    if (!targetDir || !fs.existsSync(targetDir)) {
        console.error("Could not find bank files folder in Downloads.");
        return;
    }

    console.log(`Found bank folder: ${targetDir}`);
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith(".csv") && !f.includes("Sheet1"));
    console.log(`Found ${files.length} bank CSV files to process.`);

    const pool = new Pool({ connectionString: config.databaseUrl });
    const client = await pool.connect();

    try {
        const specificFile = process.argv[2];
        if (specificFile) {
            const match = files.find(f => f.toLowerCase().includes(specificFile.toLowerCase()));
            if (!match) {
                console.error(`File matching "${specificFile}" not found.`);
                return;
            }
            await importBankFile(path.join(targetDir, match), client);
        } else {
            for (const file of files) {
                // If larger than 50MB (e.g. Axis finance 132MB), inform user or process
                await importBankFile(path.join(targetDir, file), client);
            }
        }
        console.log("\nAll bank company lists processed successfully!");
    } catch (err) {
        console.error("Import error:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    main();
}

