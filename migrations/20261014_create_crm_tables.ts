// @ts-nocheck
"use strict";

/**
 * Migration for fin_crm_app tables: users, staff_users, sessions
 */

exports.up = async function(knex) {
    // 1. users table
    const hasUsers = await knex.schema.hasTable("users");
    if (!hasUsers) {
        await knex.schema.createTable("users", table => {
            table.increments("id").primary();
            table.string("phone", 20).notNullable();
            table.string("email", 120);
            table.string("full_name", 150).notNullable();
            table.string("pan", 20);
            table.string("aadhaar_last4", 10);
            table.date("dob");
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamps(true, true);
        });

        // Insert initial demo user
        await knex("users").insert({
            phone: "9876543210",
            email: "applicant.john@example.com",
            full_name: "John Doe",
            pan: "ABCDE1234F",
            active: 1
        });
    }

    // 2. staff_users table
    const hasStaff = await knex.schema.hasTable("staff_users");
    if (!hasStaff) {
        await knex.schema.createTable("staff_users", table => {
            table.increments("id").primary();
            table.string("name", 150).notNullable();
            table.string("email", 120).notNullable().unique();
            table.string("phone", 20);
            table.integer("role_id");
            table.string("password_hash", 255).notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamps(true, true);
        });
    }

    // 3. sessions table
    const hasSessions = await knex.schema.hasTable("sessions");
    if (!hasSessions) {
        await knex.schema.createTable("sessions", table => {
            table.increments("id").primary();
            table.string("session_key", 120).notNullable().unique();
            table.integer("staff_id");
            table.integer("user_id");
            table.string("status", 20).notNullable().defaultTo("ACTIVE");
            table.string("ip_address", 60);
            table.text("user_agent");
            table.timestamp("expires_at");
            table.timestamps(true, true);
        });
    }
};

exports.down = async function(knex) {
    await knex.schema.dropTableIfExists("sessions");
    await knex.schema.dropTableIfExists("staff_users");
    await knex.schema.dropTableIfExists("users");
};

