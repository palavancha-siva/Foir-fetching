export function mapDbErrorMessage(err: any): { message: string; status: number } {
    if (!err) {
        return { message: "An unexpected error occurred.", status: 500 };
    }

    // Postgres SQLSTATE codes
    const code = err.code || "";

    switch (code) {
        case "23505": {
            // Unique violation
            const detail = err.detail || "";
            const match = detail.match(/Key \((.*?)\)=\((.*?)\) already exists/);
            const field = match ? match[1] : "field";
            return {
                message: `A record with this ${field} already exists.`,
                status: 409
            };
        }
        case "23503": {
            // Foreign key violation
            return {
                message: "Referenced entity does not exist or cannot be deleted while dependent records exist.",
                status: 400
            };
        }
        case "23502": {
            // Not null violation
            const column = err.column || "field";
            return {
                message: `Missing required field: ${column}`,
                status: 400
            };
        }
        case "22P02": {
            // Invalid input syntax
            return {
                message: "Invalid data type or input syntax.",
                status: 400
            };
        }
        case "42P01": {
            // Undefined table
            return {
                message: "Requested database entity is not configured.",
                status: 500
            };
        }
        default: {
            if (err.name === "ValidationError") {
                // Objection validation error
                return {
                    message: err.message || "Model validation failed.",
                    status: 400
                };
            }
            if (err.name === "NotFoundError") {
                return {
                    message: "Record not found.",
                    status: 404
                };
            }
            return {
                message: err.message || "An unexpected database error occurred.",
                status: err.status || err.statusCode || 500
            };
        }
    }
}
