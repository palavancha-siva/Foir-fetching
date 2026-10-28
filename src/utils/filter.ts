export interface PaginationOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    search?: string;
}

export function parsePaginationParams(query: any): {
    page: number;
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    search: string;
} {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;
    const sortBy = String(query.sortBy || "id");
    const sortOrder = (String(query.sortOrder || "desc").toLowerCase() === "asc") ? "asc" : "desc";
    const search = String(query.search || "").trim();

    return { page, limit, offset, sortBy, sortOrder, search };
}
