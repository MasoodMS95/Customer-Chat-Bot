/*
Defines every valid chatbot state.

Object.freeze() prevents properties from being added, removed,
or reassigned accidentally during runtime.

This helps preserve the state-machine structure, but it should not
be considered a security boundary.
*/
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

/*
The first message displayed when the chatbot loads.

This is exported separately because ChatWindow uses it to initialize
the messages array before the user submits anything.
*/
export const INITIAL_BOT_MESSAGE =
    "Hello, thank you for reaching out. " +
    "I understand you are trying to locate your package. " +
    "I am here to help you find it. " +
    "Do you have a tracking or order number?";

/*
Stores the standard chatbot message associated with each state.

Computed property names allow the numeric CHAT_STATE values to be
used as keys.

Object.freeze() prevents the message mappings from being changed
accidentally during runtime.
*/
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

/*
Accepted responses that indicate the user needs package assistance.

A Set is used because it provides a direct membership check through
the .has() method.
*/
const HELP_CONFIRMATIONS = new Set([
    "yes",
    "yes please",
    "help",
    "help me",
    "lost package",
    "i need help",
]);

/*
Accepted positive responses.

These responses may mean different things depending on the current
state. For example:

- In DELIVERED_CONFIRM, they indicate that the package was received.
- In ANOTHER_PACKAGE, they indicate that the user needs more help.
*/
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

/*
Accepted negative responses.

These responses may indicate that:

- A delivered package was not received.
- The user does not need help with another package.
*/
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
        /*
        The chatbot begins in the GREETING state.

        The initial greeting itself is displayed by ChatWindow using
        INITIAL_BOT_MESSAGE.
        */
        this.state = CHAT_STATE.GREETING;

        /*
        Stores the order returned by the backend after a successful lookup.

        It remains null until a valid order is found.
        */
        this.currentOrder = null;

        /*
        Each section of the conversation has its own failure counter.

        Keeping these counters separate prevents invalid attempts in one
        state from affecting the retry limit of another state.
        */
        this.confirmHelpFailures = 0;
        this.lookupFailures = 0;
        this.deliveryConfirmFailures = 0;
        this.anotherPackageFailures = 0;
    }

    /*
    Normalizes conversational input before comparing it with one of the
    accepted-response Sets.

    For example:

        "  YES Please  "

    becomes:

        "yes please"
    */
    normalizeMessage(message) {
        return message.trim().toLowerCase();
    }

    /*
    Determines whether the user's input resembles a tracking number or
    order number.

    Accepted examples:
        123456
        ABC123
        TRK-12345

    Rejected examples:
        fdas
        hello
        123 456
        TRK 123
        my order is 123

    Current validation rules:
    - The value cannot be empty.
    - The value cannot contain whitespace.
    - The value must contain at least one digit.

    This only validates the format. The backend determines whether the
    identifier actually belongs to an existing order.
    */
    isValidIdentifier(message) {
        const cleanedMessage = message.trim();

        return (
            cleanedMessage.length > 0 &&
            !/\s/.test(cleanedMessage) &&
            /\d/.test(cleanedMessage)
        );
    }

    /*
    Returns true when the message matches one of the accepted help
    confirmation responses.
    */
    isHelpConfirmation(message) {
        return HELP_CONFIRMATIONS.has(
            this.normalizeMessage(message)
        );
    }

    /*
    Returns true when the message matches one of the accepted positive
    responses.
    */
    isPositiveResponse(message) {
        return POSITIVE_RESPONSES.has(
            this.normalizeMessage(message)
        );
    }

    /*
    Returns true when the message matches one of the accepted negative
    responses.
    */
    isNegativeResponse(message) {
        return NEGATIVE_RESPONSES.has(
            this.normalizeMessage(message)
        );
    }

    /*
    Resets every retry counter.

    This is used when the user begins looking for a different package,
    giving the new lookup a fresh set of attempts.
    */
    resetCounters() {
        this.confirmHelpFailures = 0;
        this.lookupFailures = 0;
        this.deliveryConfirmFailures = 0;
        this.anotherPackageFailures = 0;
    }

    /*
    Prepares the chatbot to search for another package.

    This method:
    - Clears the previously found order.
    - Resets all retry counters.
    - Moves the chatbot to ASK_TRACKING.
    - Returns the tracking-number prompt.
    */
    beginNewPackageLookup() {
        this.currentOrder = null;
        this.resetCounters();
        this.state = CHAT_STATE.ASK_TRACKING;

        return [
            STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
        ];
    }

    /*
    Sends the tracking number or order number to the Express backend.

    The identifier is:
    - Trimmed.
    - Converted to uppercase.
    - URL encoded before being placed into the request path.

    Expected endpoint:
        GET /api/orders/:number

    Expected successful response:
        {
            id,
            orderNumber,
            trackingNumber,
            status
        }
    */
    async lookupOrder(number) {
        const cleanedNumber = number
            .trim()
            .toUpperCase();

        const response = await fetch(
            `/api/orders/${encodeURIComponent(cleanedNumber)}`
        );

        let data;

        /*
        Attempt to parse the server response as JSON.

        A response may have an HTTP status code but still contain invalid
        or non-JSON content. In that case, create an error that includes
        the HTTP status for later handling.
        */
        try {
            data = await response.json();
        } catch {
            const error = new Error(
                "The server returned an invalid response."
            );

            error.status = response.status;

            throw error;
        }

        /*
        fetch() does not automatically throw for HTTP errors such as
        404 or 500.

        response.ok is false when the HTTP status falls outside the
        successful 200–299 range.
        */
        if (!response.ok) {
            const error = new Error(
                data.error || "Unable to retrieve the package."
            );

            error.status = response.status;

            throw error;
        }

        return data;
    }

    /*
    Main state-machine dispatcher.

    ChatWindow calls processMessage() whenever the user submits a message.

    The current state determines which handler processes the input.
    Each handler returns an array because one user input can produce
    multiple chatbot messages.
    */
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
                return this.handleDeliveredConfirmation(
                    message
                );

            case CHAT_STATE.ANOTHER_PACKAGE:
                return this.handleAnotherPackage(message);

            /*
            Once the conversation reaches END, no additional chatbot
            messages should be generated.
            */
            case CHAT_STATE.END:
                return [];

            /*
            This fallback protects against an unexpected or invalid
            internal state.
            */
            default:
                console.error(
                    `Unknown chatbot state: ${this.state}`
                );

                return [
                    "I am unable to continue this conversation.",
                ];
        }
    }

    /*
    Handles user input received while the chatbot is in GREETING.

    Possible transitions:

    GREETING -> ASK_TRACKING
        The user confirms that they need help.

    GREETING -> package lookup
        The user immediately provides a valid-looking identifier.

    GREETING -> CONFIRM_HELP
        The input is neither a help confirmation nor an identifier.
    */
    async handleGreeting(message) {
        /*
        State 0 -> State 1

        The user confirms that they need package assistance.
        */
        if (this.isHelpConfirmation(message)) {
            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
            ];
        }

        /*
        State 0 -> package lookup event

        Allow the user to enter an order or tracking number immediately
        instead of requiring an additional confirmation.
        */
        if (this.isValidIdentifier(message)) {
            return this.performLookup(message);
        }

        /*
        State 0 -> State 2

        The chatbot could not determine whether the user needs help,
        so it asks for confirmation.
        */
        this.state = CHAT_STATE.CONFIRM_HELP;

        return [
            STATE_MESSAGES[CHAT_STATE.CONFIRM_HELP],
        ];
    }

    /*
    Handles input while the chatbot is asking the user to confirm that
    they need package assistance.

    The user receives three attempts before being directed to support.
    */
    handleHelpConfirmation(message) {
        /*
        State 2 -> State 1

        A recognized help confirmation moves the conversation to the
        tracking-number prompt.
        */
        if (this.isHelpConfirmation(message)) {
            this.confirmHelpFailures = 0;
            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[CHAT_STATE.ASK_TRACKING],
            ];
        }

        /*
        Record an unsuccessful help-confirmation attempt.
        */
        this.confirmHelpFailures += 1;

        /*
        State 2 -> State 6 -> State 8

        After three unrecognized responses, direct the user to support
        and then ask whether they need help with another package.
        */
        if (this.confirmHelpFailures >= 3) {
            return this.moveToSupport();
        }

        /*
        State 2 -> State 2

        Remain in the same state and ask for confirmation again.
        */
        this.state = CHAT_STATE.CONFIRM_HELP;

        return [
            STATE_MESSAGES[CHAT_STATE.CONFIRM_HELP],
        ];
    }

    /*
    Handles input while waiting for a tracking number or order number.

    This method is used by both:
    - ASK_TRACKING
    - LOOKUP_FAILED
    */
    async handleTrackingInput(message) {
        /*
        State 1 and State 4 only perform a backend lookup when the
        input passes identifier validation.
    
        Invalid formats also count as failed lookup attempts so the
        chatbot cannot remain in this state indefinitely.
        */
        if (!this.isValidIdentifier(message)) {
            this.lookupFailures += 1;

            // After three invalid tracking/order number attempts,
            // direct the user to support and move to State 8.
            if (this.lookupFailures >= 3) {
                return this.moveToSupport();
            }

            /*
            If a previous database lookup returned 404, keep using the
            lookup-failed message.
            */
            if (this.state === CHAT_STATE.LOOKUP_FAILED) {
                return [
                    STATE_MESSAGES[
                    CHAT_STATE.LOOKUP_FAILED
                    ],
                ];
            }

            // Otherwise remain in State 1 and ask for the number again.
            this.state = CHAT_STATE.ASK_TRACKING;

            return [
                STATE_MESSAGES[
                CHAT_STATE.ASK_TRACKING
                ],
            ];
        }

        return this.performLookup(message);
    }

    /*
    Performs the actual backend lookup and handles successful and failed
    responses.

    A valid-looking identifier can still fail because it may not match
    an existing order in the database.
    */
    async performLookup(number) {
        try {
            const order = await this.lookupOrder(number);

            /*
            Store the returned order and clear previous lookup failures.
            */
            this.currentOrder = order;
            this.lookupFailures = 0;

            /*
            Report the order's current status and determine the next state.
            */
            return this.reportStatus(order);
        } catch (error) {
            /*
            A 404 means:
            - The input passed local validation.
            - The server was reached.
            - No matching package was found.
            */
            if (error.status === 404) {
                this.lookupFailures += 1;

                /*
                State 4 -> State 6 -> State 8

                After three unsuccessful database lookups, direct the
                user to support.
                */
                if (this.lookupFailures >= 3) {
                    return this.moveToSupport();
                }

                /*
                Lookup event -> State 4

                Allow the user to correct the identifier and try again.
                */
                this.state =
                    CHAT_STATE.LOOKUP_FAILED;

                return [
                    STATE_MESSAGES[
                    CHAT_STATE.LOOKUP_FAILED
                    ],
                ];
            }

            /*
            Network, database, server, and malformed-response errors are
            system problems rather than incorrect user attempts.

            They therefore do not increment lookupFailures.
            */
            console.error(
                "Order lookup failed:",
                error
            );

            return [
                "I couldn't access the package system right now. " +
                "Please try again.",
            ];
        }
    }

    /*
    Reports the status returned by the backend and selects the next state.

    Possible transitions:

    REPORT_STATUS -> DELIVERED_CONFIRM
        The package status is Delivered.

    REPORT_STATUS -> ANOTHER_PACKAGE
        The package has any other status.
    */
    reportStatus(order) {
        /*
        State 3

        The chatbot temporarily enters REPORT_STATUS while preparing the
        status response.
        */
        this.state = CHAT_STATE.REPORT_STATUS;
        let statusMessage;
        switch (order.status) {
            case "Order Received":
                statusMessage = `We have received your order and are processing it now.`;
                break;
            case "Shipping":
                statusMessage = `We are shipping your product soon. You will be contacted by email with the tracking number when it has shipped.`;
                break;
            case "Shipped":
                statusMessage = `We have shipped your product. The tracking number is ${order.trackingNumber}, please go to our shipping partner with this tracking number to get real-time updates.`;
                break;
            case "Out for Delivery":
                statusMessage = `Your order is currently out for delivery. It should arrive soon. The tracking number is ${order.trackingNumber}, please go to our shipping partner with this tracking number to get real-time updates.`;
                break;
            case "Delivered":
                statusMessage = `Your order has been delivered.`
                break;
            default:
                statusMessage = `The package is currently ${order.status}.`;
        }

        /*
        State 3 -> State 5

        Delivered packages require confirmation because the user may not
        have physically received the package.
        */
        if (order.status === "Delivered") {
            this.state =
                CHAT_STATE.DELIVERED_CONFIRM;

            return [
                statusMessage,
                STATE_MESSAGES[
                CHAT_STATE.DELIVERED_CONFIRM
                ],
            ];
        }

        /*
        State 3 -> State 8

        For non-delivered packages, report the status and ask whether the
        user needs help with another package.
        */
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            statusMessage,
            STATE_MESSAGES[
            CHAT_STATE.ANOTHER_PACKAGE
            ],
        ];
    }

    /*
    Handles the user's response after a package was reported as Delivered.

    Possible outcomes:
    - The user confirms receipt.
    - The user says the package was not received.
    - The response is not recognized.
    */
    handleDeliveredConfirmation(message) {
        /*
        State 5 -> State 8

        The user confirms that the package was received.
        */
        if (this.isPositiveResponse(message)) {
            this.deliveryConfirmFailures = 0;
            this.state = CHAT_STATE.ANOTHER_PACKAGE;

            return [
                STATE_MESSAGES[
                CHAT_STATE.ANOTHER_PACKAGE
                ],
            ];
        }

        /*
        State 5 -> State 7 -> State 8

        The user says the delivered package was not received.

        The chatbot provides lost-package advice and then asks whether
        the user needs help with another package.
        */
        if (this.isNegativeResponse(message)) {
            this.deliveryConfirmFailures = 0;
            this.state =
                CHAT_STATE.LOST_PACKAGE_ADVICE;

            const adviceMessage =
                STATE_MESSAGES[
                CHAT_STATE.LOST_PACKAGE_ADVICE
                ];

            /*
            LOST_PACKAGE_ADVICE is an automatic informational state, so
            the chatbot immediately advances to ANOTHER_PACKAGE.
            */
            this.state = CHAT_STATE.ANOTHER_PACKAGE;

            return [
                adviceMessage,
                STATE_MESSAGES[
                CHAT_STATE.ANOTHER_PACKAGE
                ],
            ];
        }

        /*
        The response was not recognized as positive or negative.
        */
        this.deliveryConfirmFailures += 1;

        /*
        State 5 -> State 6 -> State 8

        After three unclear responses, direct the user to support.
        */
        if (this.deliveryConfirmFailures >= 3) {
            return this.moveToSupport();
        }

        /*
        State 5 -> State 5

        Remain in the same state and repeat the delivery question.
        */
        this.state =
            CHAT_STATE.DELIVERED_CONFIRM;

        return [
            STATE_MESSAGES[
            CHAT_STATE.DELIVERED_CONFIRM
            ],
        ];
    }

    /*
    Handles the user's response to:

        "Do you need help with another package?"

    Possible transitions:

    ANOTHER_PACKAGE -> ASK_TRACKING
        The user wants more help.

    ANOTHER_PACKAGE -> END
        The user does not need more help.

    ANOTHER_PACKAGE -> ANOTHER_PACKAGE
        The response is unclear.
    */
    handleAnotherPackage(message) {
        /*
        State 8 -> State 1

        A positive response or help confirmation begins a new lookup.
        */
        if (
            this.isPositiveResponse(message) ||
            this.isHelpConfirmation(message)
        ) {
            return this.beginNewPackageLookup();
        }

        /*
        State 8 -> State 9

        A negative response ends the conversation.
        */
        if (this.isNegativeResponse(message)) {
            this.anotherPackageFailures = 0;
            this.state = CHAT_STATE.END;

            return [
                STATE_MESSAGES[CHAT_STATE.END],
            ];
        }

        /*
        Record an unclear response.
        */
        this.anotherPackageFailures += 1;

        /*
        State 8 -> State 9

        End the conversation after three unclear responses.
        */
        if (this.anotherPackageFailures >= 3) {
            this.state = CHAT_STATE.END;

            return [
                STATE_MESSAGES[CHAT_STATE.END],
            ];
        }

        /*
        State 8 -> State 8

        Repeat the question when the response is not recognized.
        */
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            STATE_MESSAGES[
            CHAT_STATE.ANOTHER_PACKAGE
            ],
        ];
    }

    /*
    Directs the user to customer support.

    CONTACT_SUPPORT is an automatic message state rather than a state
    that waits for user input.

    The chatbot therefore:
    1. Enters CONTACT_SUPPORT.
    2. Creates the support message.
    3. Automatically advances to ANOTHER_PACKAGE.
    4. Returns both messages.
    */
    moveToSupport() {
        // State 6
        this.state = CHAT_STATE.CONTACT_SUPPORT;

        const supportMessage =
            STATE_MESSAGES[
            CHAT_STATE.CONTACT_SUPPORT
            ];

        // State 6 automatically transitions to State 8.
        this.state = CHAT_STATE.ANOTHER_PACKAGE;

        return [
            supportMessage,
            STATE_MESSAGES[
            CHAT_STATE.ANOTHER_PACKAGE
            ],
        ];
    }

    /*
    Allows ChatWindow to determine whether the conversation has ended.

    ChatWindow uses this result to disable the input field and send button.
    */
    isClosed() {
        return this.state === CHAT_STATE.END;
    }
}

export default ChatbotDriver;