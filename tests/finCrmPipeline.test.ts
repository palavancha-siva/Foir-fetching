// @ts-nocheck
"use strict";

require("ts-node/register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { encrypt, decrypt } = require("../src/encryption/encryption");
const { signStaffToken, verifyToken } = require("../src/utils/jwt");
const { getOkResponse, getPaginationResponse, getErrorResponse } = require("../src/utils/apiResponse");
const { mapDbErrorMessage } = require("../src/utils/dbErrorMessages");

test("AES-256-GCM encryption and decryption roundtrip", () => {
    const originalText = JSON.stringify({ applicantName: "John Doe", monthlySalary: 75000 });
    const cipher = encrypt(originalText);

    assert.ok(cipher.includes(":"), "Cipher text must have iv:authTag:cipher format");
    assert.notEqual(cipher, originalText, "Cipher text must be encrypted");

    const decrypted = decrypt(cipher);
    assert.equal(decrypted, originalText, "Decrypted text must match original plain text");
    const parsed = JSON.parse(decrypted);
    assert.equal(parsed.applicantName, "John Doe");
    assert.equal(parsed.monthlySalary, 75000);
});

test("RS256 JWT key generation, signing, and verification", () => {
    const staffPayload = {
        id: 42,
        email: "officer@fin.internal",
        name: "Loan Officer 1",
        permissions: ["staff_read", "loans_write"],
        sessionKey: "session_test_uuid_123"
    };

    const token = signStaffToken(staffPayload, "1h");
    assert.ok(typeof token === "string" && token.split(".").length === 3, "Token must be a valid 3-part JWT");

    const decoded = verifyToken(token);
    assert.equal(decoded.id, 42);
    assert.equal(decoded.email, "officer@fin.internal");
    assert.deepEqual(decoded.permissions, ["staff_read", "loans_write"]);
    assert.equal(decoded.sessionKey, "session_test_uuid_123");
});

test("Standard API response envelope formatting", () => {
    const okEnvelope = getOkResponse({ company: "Google India" }, 1, "Company found");
    assert.deepEqual(okEnvelope, {
        error: false,
        status: 200,
        message: "Company found",
        data: { company: "Google India", count: 1 }
    });

    const pageEnvelope = getPaginationResponse([{ id: 1 }, { id: 2 }], 50, 1, 10);
    assert.equal(pageEnvelope.error, false);
    assert.equal(pageEnvelope.data.totalPages, 5);
    assert.equal(pageEnvelope.data.items.length, 2);

    const errEnvelope = getErrorResponse("Invalid payload", 400);
    assert.equal(errEnvelope.error, true);
    assert.equal(errEnvelope.status, 400);
    assert.equal(errEnvelope.message, "Invalid payload");
});

test("Postgres constraint error sanitization (dbErrorMessages)", () => {
    const uniqueError = { code: "23505", detail: "Key (email)=(test@example.com) already exists." };
    const mappedUnique = mapDbErrorMessage(uniqueError);
    assert.equal(mappedUnique.status, 409);
    assert.ok(mappedUnique.message.includes("already exists"));

    const fkError = { code: "23503" };
    const mappedFk = mapDbErrorMessage(fkError);
    assert.equal(mappedFk.status, 400);
});

