const express = require("express");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = 3000;

app.use(express.json());

const databasePath = path.join(__dirname, "orders.db");
const db = new DatabaseSync(databasePath);

console.log("Connected to SQLite database.");

const VALID_STATUSES = [
    "Order Received",
    "Shipping",
    "Shipped",
    "Out for Delivery",
    "Delivered",
];

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        tracking_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL
    )
`);

function generateTrackingNumber() {
    //Produces a number between 100000 - 999999
    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `TRK-${randomNumber}`;
}

//Ensures the tracking number generated is unique
function getUniqueTrackingNumber() {
    let trackingNumber = generateTrackingNumber();

    const findTrackingNumber = db.prepare(`
        SELECT tracking_number
        FROM orders
        WHERE tracking_number = ?
    `);

    //While our tracking number isn't unique, generate a new number.
    while (findTrackingNumber.get(trackingNumber)) {
        trackingNumber = generateTrackingNumber();
    }

    return trackingNumber;
}

app.post("/api/orders", (req, res) => {
    const orderNumber = req.body.orderNumber?.trim().toUpperCase();
    const status = req.body.status;

    //These shouldn't trigger as we will handle this on the frontend, but extra protection is still good.
    if (!orderNumber) {
        return res.status(400).json({
            error: "An order number is required.",
        });
    }

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            error: "The selected order status is invalid.",
            validStatuses: VALID_STATUSES,
        });
    }

    try {
        const trackingNumber = getUniqueTrackingNumber();

        const insertOrder = db.prepare(`
            INSERT INTO orders (
                order_number,
                tracking_number,
                status
            )
            VALUES (?, ?, ?)
        `);

        const result = insertOrder.run(
            orderNumber,
            trackingNumber,
            status
        );

        return res.status(201).json({
            id: Number(result.lastInsertRowid),
            orderNumber,
            trackingNumber,
            status,
        });
    } catch (error) {
        if (
            error.message.includes(
                "UNIQUE constraint failed: orders.order_number"
            )
        ) {
            return res.status(409).json({
                error: "That order number already exists.",
            });
        }

        console.error(error);

        return res.status(500).json({
            error: "Unable to create the order.",
        });
    }
});

app.get("/api/orders/:number", (req, res) => {
    const number = req.params.number.trim().toUpperCase();

    try {
        const findOrder = db.prepare(`
            SELECT
                id,
                order_number AS orderNumber,
                tracking_number AS trackingNumber,
                status
            FROM orders
            WHERE order_number = ?
               OR tracking_number = ?
        `);

        //Call with number twice, once using it as order_number, once as tracking_number
        const order = findOrder.get(number, number);

        if (!order) {
            return res.status(404).json({
                error: "No order was found with that number.",
            });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Unable to retrieve the order.",
        });
    }
});

//Catch all for all non defined routes.
app.use((req, res) => {
    return res.status(404).json({
        error: "Route not found.",
    });
});

app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
});