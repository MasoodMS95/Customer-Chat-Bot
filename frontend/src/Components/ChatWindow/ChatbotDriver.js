export const CHAT_STATE = Object.freeze({
    GREETING: 0,
    ASK_TRACKING: 1,
    CONFIRM_HELP: 2,
    REPORT_STATUS: 3,
    LOOKUP_FAILED: 4,
    DELIVERED_CONFIRM: 5,
    CONTACT_SUPPORT: 6,
    LOST_PACKAGE_ADVICE: 7,
    ANOTHER_PACKAGE: 8,
    END: 9,
});

export const INITIAL_BOT_MESSAGE =
    "Hello, thank you for reaching out. " +
    "I understand you are trying to locate your package. " +
    "I am here to help you find it. " +
    "Do you have a tracking or order number?";

const STATE_MESSAGES = Object.freeze({
    [CHAT_STATE.ASK_TRACKING]:
        "Please enter your tracking number or order number.",

    [CHAT_STATE.CONFIRM_HELP]:
        "Please confirm that you need help with a package.",

    [CHAT_STATE.LOOKUP_FAILED]:
        "I couldn't find a package with that number. " +
        "Please double-check it for any mistakes and try again.",

    [CHAT_STATE.DELIVERED_CONFIRM]:
        "Have you received the package?",

    [CHAT_STATE.CONTACT_SUPPORT]:
        "I'm sorry, but I can't help further with this package. " +
        "Please contact support at support@company.com.",

    [CHAT_STATE.LOST_PACKAGE_ADVICE]:
        "Please check around the delivery location, including porches, " +
        "side doors, mailrooms, household members, neighbors, or building staff. " +
        "If the package was only recently marked delivered, the carrier may " +
        "still be completing the delivery, so please allow some additional time.",

    [CHAT_STATE.ANOTHER_PACKAGE]:
        "Do you need help with another package?",

    [CHAT_STATE.END]:
        "Thank you for doing business with us. Have a great day.",
});

const HELP_CONFIRMATIONS = new Set([
    "yes",
    "yes please",
    "help",
    "help me",
    "lost package",
    "i need help",
]);

const POSITIVE_RESPONSES = new Set([
    "yes",
    "yes please",
    "y",
    "yeah",
    "yep",
    "received",
    "received it",
    "found",
    "found it",
    "i received it",
    "i found it",
]);

const NEGATIVE_RESPONSES = new Set([
    "no",
    "no thank you",
    "no thanks",
    "n",
    "nope",
    "not received",
    "did not receive",
    "didn't receive",
    "not found",
    "did not find it",
    "didn't find it",
    "i did not receive it",
    "i didn't receive it",
]);

class ChatbotDriver {
    constructor() {
        this.state = CHAT_STATE.GREETING;
        this.currentOrder = null;

        // Each state has its own independent failure counter.
        this.confirmHelpFailures = 0;
        this.lookupFailures = 0;
        this.deliveryConfirmFailures = 0;
        this.anotherPackageFailures = 0;
    }

    normalizeMessage(message) {
        return message.trim().toLowerCase();
    }

    /*
    Accepted:
        123456
        ABC123
        TRK-12345

    Rejected:
        fdas
        hello
        123 456
        TRK 123
        my order is 123
    */
    isValidIdentifier(message) {
        const cleanedMessage = message.trim();

        return (
            cleanedMessage.length > 0 &&
            !/\s/.test(cleanedMessage) &&
            /\d/.test(cleanedMessage)
        );
    }

    isHelpConfirmation(message) {
        return HELP_CONFIRMATIONS.has(
            this.normalizeMessage(message)
        );
    }

    isPositiveResponse(message) {
        return POSITIVE_RESPONSES.has(
            this.normalizeMessage(message)
        );
    }

    isNegativeResponse(message) {
        return NEGATIVE_RESPONSES.has(
            this.normalizeMessage(message)
        );
    }

    resetCounters() {
        this.confirmHelpFailures = 0;
        this.lookupFailures = 0;
        this.deliveryConfirmFailures = 0;
        this.anotherPackageFailures = 0;
    }

    beginNewPackageLookup() {
        this.currentOrder = null;
        this.resetCounters();
        this.state = CHAT_STATE.ASK_TRACKING;

        return [
            STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
        ];
    }

    async lookupOrder(number) {
        const cleanedNumber = number
            .trim()
            .toUpperCase();

        const response = await fetch(
            `/api/orders/${encodeURIComponent(cleanedNumber)}`
        );

        let data;

        try {
            data = await response.json();
        } catch {
            const error = new Error(
                "The server returned an invalid response."
            );

            error.status = response.status;

            throw error;
        }

        if (!response.ok) {
            const error = new Error(
                data.error || "Unable to retrieve the package."
            );

            error.status = response.status;

            throw error;
        }

        return data;
    }

    async processMessage(message) {
        switch (this.state) {
            case CHAT_STATE.GREETING:
                return this.handleGreeting(message);

            case CHAT_STATE.ASK_TRACKING:
                return this.handleTrackingInput(message);

            case CHAT_STATE.CONFIRM_HELP:
                return this.handleHelpConfirmation(message);

            case CHAT_STATE.LOOKUP_FAILED:
                return this.handleTrackingInput(message);

            case CHAT_STATE.DELIVERED_CONFIRM:
                return this.handleDeliveredConfirmation(message);

            case CHAT_STATE.ANOTHER_PACKAGE:
                return this.handleAnotherPackage(message);

            case CHAT_STATE.END:
                return [];

            default:
                console.error(
                    `Unknown chatbot state: ${this.state}`
                );

                return [
                    "I am unable to continue this conversation.",
                ];
        }
    }

    async handleGreeting(message) {
        // State 0 -> State 1
        if (this.isHelpConfirmation(message)) {
            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
            ];
        }

        // State 0 -> lookup event
        if (this.isValidIdentifier(message)) {
            return this.performLookup(message);
        }

        // State 0 -> State 2
        this.state = CHAT_STATE.CONFIRM_HELP;

        return [
            STATE_MESSAGES[CHAT_STATE.CONFIRM_HELP],
        ];
    }

    handleHelpConfirmation(message) {
        // State 2 -> State 1
        if (this.isHelpConfirmation(message)) {
            this.confirmHelpFailures = 0;
            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
            ];
        }

        this.confirmHelpFailures += 1;

        // State 2 -> State 6 -> State 8
        if (this.confirmHelpFailures >= 3) {
            return this.moveToSupport();
        }

        // State 2 -> State 2
        this.state = CHAT_STATE.CONFIRM_HELP;

        return [
            STATE_MESSAGES[CHAT_STATE.CONFIRM_HELP],
        ];
    }

    async handleTrackingInput(message) {
        /*
        State 1 and State 4 only perform a backend lookup
        when the input passes identifier validation.
        */
        if (!this.isValidIdentifier(message)) {
            if (this.state === CHAT_STATE.LOOKUP_FAILED) {
                return [
                    STATE_MESSAGES[CHAT_STATE.LOOKUP_FAILED],
                ];
            }

            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
            ];
        }

        return this.performLookup(message);
    }

    async performLookup(number) {
        try {
            const order = await this.lookupOrder(number);

            this.currentOrder = order;
            this.lookupFailures = 0;

            return this.reportStatus(order);
        } catch (error) {
            /*
            A 404 means the number passed validation,
            but no matching package exists.
            */
            if (error.status === 404) {
                this.lookupFailures += 1;

                // State 4 -> State 6 -> State 8
                if (this.lookupFailures >= 3) {
                    return this.moveToSupport();
                }

                // Lookup event -> State 4
                this.state = CHAT_STATE.LOOKUP_FAILED;

                return [
                    STATE_MESSAGES[CHAT_STATE.LOOKUP_FAILED],
                ];
            }

            /*
            Network, database, server, or malformed-response errors
            do not count as incorrect package lookup attempts.
            */
            console.error("Order lookup failed:", error);

            return [
                "I couldn't access the package system right now. " +
                "Please try again.",
            ];
        }
    }

    reportStatus(order) {
        // State 3
        this.state = CHAT_STATE.REPORT_STATUS;

        const statusMessage =
            `The package is currently ${order.status}.`;

        // State 3 -> State 5
        if (order.status === "Delivered") {
            this.state = CHAT_STATE.DELIVERED_CONFIRM;

            return [
                statusMessage,
                STATE_MESSAGES[
                CHAT_STATE.DELIVERED_CONFIRM
                ],
            ];
        }

        // State 3 -> State 8
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            statusMessage,
            STATE_MESSAGES[CHAT_STATE.ANOTHER_PACKAGE],
        ];
    }

    handleDeliveredConfirmation(message) {
        // State 5 -> State 8
        if (this.isPositiveResponse(message)) {
            this.deliveryConfirmFailures = 0;
            this.state = CHAT_STATE.ANOTHER_PACKAGE;

            return [
                STATE_MESSAGES[CHAT_STATE.ANOTHER_PACKAGE],
            ];
        }

        // State 5 -> State 7 -> State 8
        if (this.isNegativeResponse(message)) {
            this.deliveryConfirmFailures = 0;
            this.state = CHAT_STATE.LOST_PACKAGE_ADVICE;

            const adviceMessage =
                STATE_MESSAGES[
                CHAT_STATE.LOST_PACKAGE_ADVICE
                ];

            this.state = CHAT_STATE.ANOTHER_PACKAGE;

            return [
                adviceMessage,
                STATE_MESSAGES[CHAT_STATE.ANOTHER_PACKAGE],
            ];
        }

        this.deliveryConfirmFailures += 1;

        // State 5 -> State 6 -> State 8
        if (this.deliveryConfirmFailures >= 3) {
            return this.moveToSupport();
        }

        // State 5 -> State 5
        this.state = CHAT_STATE.DELIVERED_CONFIRM;

        return [
            STATE_MESSAGES[CHAT_STATE.DELIVERED_CONFIRM],
        ];
    }

    handleAnotherPackage(message) {
        // State 8 -> State 1
        if (
            this.isPositiveResponse(message) ||
            this.isHelpConfirmation(message)
        ) {
            return this.beginNewPackageLookup();
        }

        // State 8 -> State 9
        if (this.isNegativeResponse(message)) {
            this.anotherPackageFailures = 0;
            this.state = CHAT_STATE.END;

            return [
                STATE_MESSAGES[CHAT_STATE.END],
            ];
        }

        this.anotherPackageFailures += 1;

        // State 8 -> State 9
        if (this.anotherPackageFailures >= 3) {
            this.state = CHAT_STATE.END;

            return [
                STATE_MESSAGES[CHAT_STATE.END],
            ];
        }

        // State 8 -> State 8
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            STATE_MESSAGES[CHAT_STATE.ANOTHER_PACKAGE],
        ];
    }

    moveToSupport() {
        // State 6
        this.state = CHAT_STATE.CONTACT_SUPPORT;

        const supportMessage =
            STATE_MESSAGES[CHAT_STATE.CONTACT_SUPPORT];

        // State 6 automatically transitions to State 8.
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            supportMessage,
            STATE_MESSAGES[CHAT_STATE.ANOTHER_PACKAGE],
        ];
    }

    isClosed() {
        return this.state === CHAT_STATE.END;
    }
}

export default ChatbotDriver;