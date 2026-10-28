import { EventEmitter } from "events";

export const eventEmitter = new EventEmitter();

export const EVENTS = {
    STAFF_LOGGED_IN: "staff.logged_in",
    LOAN_APPLICATION_SUBMITTED: "loan.application.submitted",
    LOAN_STATUS_UPDATED: "loan.status.updated",
    NOTIFICATION_TRIGGERED: "notification.triggered"
};
