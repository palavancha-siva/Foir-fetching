import { Model } from "objection";

export class BaseModel extends Model {
    id!: number;
    createdAt?: string;
    updatedAt?: string;

    $beforeInsert() {
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
    }

    $beforeUpdate() {
        this.updatedAt = new Date().toISOString();
    }
}
