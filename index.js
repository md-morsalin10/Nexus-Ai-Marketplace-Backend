const express = require('express');
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

app.get('/', (req, res) => {
    res.send('NexusAI Marketplace Backend — Running');
});

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();
        console.log("Connected to MongoDB");

        const database = client.db("GadgetHub");
        const userCollection = database.collection("users");
        const productsCollection = database.collection("products");
        const ordersCollection = database.collection("orders");
        const paymentCollection = database.collection("payment");

        // ─────────────────────────────────────────────
        // USER ROUTES
        // ─────────────────────────────────────────────



        app.post("/api/payment", async (req, res) => {
            const { sessionId, sellerId, price, sellerName, sellerEmail, title, productId, buyerName, buyerEmail, buyerId, image, status, description, features } = req.body;

            const result = await paymentCollection.insertOne({
                sessionId,
                sellerId,
                price,
                sellerName,
                sellerEmail,
                title,
                productId,
                buyerName,
                buyerEmail,
                buyerId,
                image,
                status,
                description,
                features,
                purchaseDate: new Date()
            });

            const updateResult = await productsCollection.updateOne(
                { _id: new ObjectId(productId) },
                {
                    $set: {
                        status: "sold",
                        buyerEmail: buyerEmail,
                        buyerId: buyerId,
                        buyerName: buyerName
                    }
                }
            );

            console.log("--- MONGODB USER UPDATE RESULT ---", updateResult);
            res.send({ message: "subscription created", result });
        });

        app.get("/api/payment", async (req, res) => {
            const query = {};
            if (req.query.buyerId) {
                query.buyerId = req.query.buyerId
            }
            if (req.query.buyerEmail) {
                query.buyerEmail = req.query.buyerEmail
            }

            if (req.query.sellerId) {
                query.sellerId = req.query.sellerId
            }

            const userPayment = await paymentCollection.find(query).toArray()
            res.send(userPayment)
        })


        // GET all users (Admin)
        app.get("/api/users", async (req, res) => {
            try {
                const result = await userCollection.find().toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // PATCH user role — supports buyer | seller | admin (Admin)
        app.patch("/api/users/:id/role", async (req, res) => {
            try {
                const id = req.params.id;
                const { role } = req.body;
                const validRoles = ['buyer', 'seller', 'admin'];
                if (!validRoles.includes(role)) {
                    return res.status(400).send({ error: "Invalid role. Must be buyer, seller, or admin." });
                }
                let filterQuery;
                if (ObjectId.isValid(id) && id.length === 24) {
                    filterQuery = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
                } else {
                    filterQuery = { $or: [{ _id: id }, { id: id }] };
                }
                const result = await userCollection.updateOne(filterQuery, { $set: { role } });
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // DELETE user (Admin)
        app.delete("/api/users/:id", async (req, res) => {
            try {
                const id = req.params.id;
                let filterQuery;
                if (ObjectId.isValid(id) && id.length === 24) {
                    filterQuery = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
                } else {
                    filterQuery = { $or: [{ _id: id }, { id: id }] };
                }
                const result = await userCollection.deleteOne(filterQuery);
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // PUT update user profile
        app.put("/api/users/profile", async (req, res) => {
            try {
                const { email, name, image } = req.body;
                if (!email) return res.status(400).send({ error: "Email is required" });
                const result = await userCollection.updateOne(
                    { email },
                    { $set: { name, image } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET single user by email
        app.get("/api/users/email/:email", async (req, res) => {
            try {
                const result = await userCollection.findOne({ email: req.params.email });
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // ─────────────────────────────────────────────
        // PRODUCT ROUTES
        // ─────────────────────────────────────────────

        // GET published products — public marketplace
        app.get("/api/products", async (req, res) => {
            try {
                // Show published products + legacy products with no status field
                const result = await productsCollection.find({
                    $or: [
                        { status: "published" },
                        { status: { $exists: false } } // backward compat for old products
                    ]
                }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET ALL products — Admin only (all statuses)
        app.get("/api/products/all", async (req, res) => {
            try {
                const result = await productsCollection.find().toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET pending products — Admin approval queue
        app.get("/api/products/pending", async (req, res) => {
            try {
                const result = await productsCollection.find({ status: "pending" }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET seller's own products (all statuses)
        app.get("/api/products/seller/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const result = await productsCollection.find({
                    $or: [{ sellerId: id }, { sellerEmail: req.query.email }, { creatorEmail: req.query.email }]
                }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET single product by ID
        app.get("/api/products/:id", async (req, res) => {
            try {
                const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!product) return res.status(404).send({ error: "Product not found" });
                res.send(product);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // POST create product (Seller) — starts as pending
        app.post("/api/products", async (req, res) => {
            try {
                const product = req.body;
                const newProduct = {
                    ...product,
                    status: product.status || "pending",
                    createdAt: new Date().toISOString()
                };
                const result = await productsCollection.insertOne(newProduct);
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // PUT update product (Seller can edit own, Admin can edit any)
        app.put("/api/products/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const updatedProduct = req.body;
                delete updatedProduct._id;
                const result = await productsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { ...updatedProduct, updatedAt: new Date().toISOString() } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // PATCH product status — Admin approve/reject
        app.patch("/api/products/:id/status", async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body;
                const validStatuses = ['pending', 'published', 'rejected'];
                if (!validStatuses.includes(status)) {
                    return res.status(400).send({ error: "Invalid status. Must be pending, published, or rejected." });
                }
                const result = await productsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status, reviewedAt: new Date().toISOString() } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // DELETE product
        app.delete("/api/products/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // ─────────────────────────────────────────────
        // ORDER ROUTES
        // ─────────────────────────────────────────────

        // GET buyer's orders
        app.get("/api/orders/buyer/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const result = await ordersCollection.find({
                    $or: [{ buyerId: id }, { buyerEmail: req.query.email }, { email: req.query.email }]
                }).sort({ createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET all orders — Admin
        app.get("/api/orders", async (req, res) => {
            try {
                const result = await ordersCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // ─────────────────────────────────────────────
        // ORDER MANAGEMENT ROUTES
        // ─────────────────────────────────────────────

        // POST create new order (Called from Next.js frontend after Stripe success)
        app.post("/api/orders", async (req, res) => {
            const { sessionId, email, buyerId, items, totalAmount } = req.body;

            try {
                // Idempotency check: Ensure we don't save the same order twice
                if (sessionId) {
                    const existing = await ordersCollection.findOne({ stripePaymentId: sessionId });
                    if (existing) {
                        return res.send({ success: true, alreadyRegistered: true, order: existing });
                    }
                }

                const orderRecord = {
                    buyerId: buyerId || null,
                    buyerEmail: email,
                    stripePaymentId: sessionId || null, // Provided by frontend's Stripe workflow
                    items: items || [],
                    totalAmount: totalAmount || items.reduce((acc, curr) => acc + (curr.price || 0), 0),
                    status: "completed",
                    createdAt: new Date().toISOString()
                };

                const result = await ordersCollection.insertOne(orderRecord);
                res.send({ success: true, result, order: orderRecord });
            } catch (error) {
                console.error("Save order error:", error);
                res.status(500).send({ error: error.message });
            }
        });

        // ─────────────────────────────────────────────
        // ANALYTICS / STATS ROUTES
        // ─────────────────────────────────────────────

        // GET platform stats — Admin overview
        app.get("/api/stats", async (req, res) => {
            try {
                const totalUsers = await userCollection.countDocuments();
                const totalProducts = await productsCollection.countDocuments();
                const totalPublished = await productsCollection.countDocuments({ status: "published" });
                const totalPending = await productsCollection.countDocuments({ status: "pending" });

                const allOrders = await ordersCollection.find().toArray();
                const totalRevenue = allOrders.reduce((acc, o) => acc + (o.totalAmount || o.amount || 0), 0);
                const totalOrders = allOrders.length;

                const products = await productsCollection.find().toArray();
                const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

                res.send({
                    totalUsers,
                    totalProducts,
                    totalPublished,
                    totalPending,
                    totalCategories: categories.length,
                    totalRevenue,
                    totalOrders
                });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET detailed sales analytics — Admin
        app.get("/api/sales-stats", async (req, res) => {
            try {
                const allOrders = await ordersCollection.find().toArray();

                let totalRevenue = 0;
                let totalSalesCount = 0;
                const itemSalesMap = {};
                const monthlySalesMap = {};

                allOrders.forEach(order => {
                    const orderTotal = order.totalAmount || order.amount || 0;
                    totalRevenue += orderTotal;

                    // Monthly grouping
                    const month = order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                        : 'Unknown';

                    if (!monthlySalesMap[month]) {
                        monthlySalesMap[month] = { month, revenue: 0, orders: 0 };
                    }
                    monthlySalesMap[month].revenue += orderTotal;
                    monthlySalesMap[month].orders += 1;

                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            totalSalesCount += 1;
                            const key = item.name || item.title || 'Unknown';
                            if (!itemSalesMap[key]) {
                                itemSalesMap[key] = { name: key, category: item.category, price: item.price, salesCount: 0, revenue: 0 };
                            }
                            itemSalesMap[key].salesCount += 1;
                            itemSalesMap[key].revenue += (item.price || 0);
                        });
                    }
                });

                const topSoldItems = Object.values(itemSalesMap).sort((a, b) => b.salesCount - a.salesCount).slice(0, 10);
                const monthlyData = Object.values(monthlySalesMap).slice(-6);

                res.send({
                    totalRevenue,
                    totalSalesCount,
                    totalOrders: allOrders.length,
                    topSoldItems,
                    monthlyData,
                    allOrders
                });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET seller's own product stats
        app.get("/api/seller/stats/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const sellerProducts = await productsCollection.find({
                    $or: [{ sellerId: id }, { sellerEmail: id }, { creatorEmail: id }]
                }).toArray();

                const published = sellerProducts.filter(p => p.status === 'published').length;
                const pending = sellerProducts.filter(p => p.status === 'pending').length;
                const rejected = sellerProducts.filter(p => p.status === 'rejected').length;
                const total = sellerProducts.length;

                res.send({ total, published, pending, rejected, products: sellerProducts });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // ─────────────────────────────────────────────
        // AI AGENTIC CHAT
        // ─────────────────────────────────────────────
        app.post('/api/ai/chat', async (req, res) => {
            const { history, message } = req.body;
            try {
                if (!process.env.GROQ_API_KEY) {
                    return res.status(500).send({ error: "Groq API key is not configured in backend environment." });
                }
                const Groq = require('groq-sdk');
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

                const tools = [{
                    type: "function",
                    function: {
                        name: "searchProducts",
                        description: "Search for products in the NexusAI Marketplace. Use this when the user asks to find products or recommendations.",
                        parameters: {
                            type: "object",
                            properties: {
                                category: { type: "string", description: 'Product category (e.g. "AI Tools", "Gadgets", "Electronics", "Wearables")' },
                                maxPrice: { type: "number", description: 'Maximum price limit as a numeric value without quotes (e.g. 50, 100, 500). Do NOT pass string values.' },
                                keyword: { type: "string", description: 'Search keyword (e.g. "laptop", "audio", "drone")' }
                            }
                        }
                    }
                }];

                const groqMessages = [
                    { role: 'system', content: "You are the Agentic AI Chat Assistant for NexusAI Marketplace. You help users navigate the site and find products. When asked for recommendations, use the searchProducts tool. If you recommend navigation, provide the path like /all-products, /dashboard/buyer, /dashboard/seller, /dashboard/admin, or /register.\n\nCRITICAL: When generating tool calls for searchProducts, all numeric parameters like maxPrice MUST be formatted as raw JSON numbers (e.g. 50) and NEVER enclosed in string quotes (e.g. \"50\")." },
                    ...(history || []).map(m => ({
                        role: m.role === 'model' ? 'assistant' : m.role,
                        content: m.parts[0].text
                    })),
                    { role: 'user', content: message }
                ];

                const response = await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: groqMessages,
                    tools: tools,
                    tool_choice: "auto"
                });

                const responseMessage = response.choices[0].message;
                let textResponse = responseMessage.content || "";
                let recommendedProducts = [];

                if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                    const call = responseMessage.tool_calls[0];
                    if (call.function.name === 'searchProducts') {
                        try {
                            const args = JSON.parse(call.function.arguments);
                            let category = args.category || null;
                            let keyword = args.keyword || null;
                            let maxPrice = args.maxPrice;
                            if (maxPrice !== undefined && maxPrice !== null) {
                                maxPrice = Number(maxPrice);
                            }
                            const parsedPrice = maxPrice;

                            const projection = { title: 1, name: 1, price: 1, images: 1, image: 1, category: 1, _id: 1 };

                            const query = { status: 'published' };
                            if (category) query.category = new RegExp(category, 'i');
                            if (parsedPrice && !isNaN(parsedPrice)) query.price = { $lte: parsedPrice };
                            if (keyword) {
                                query.$or = [
                                    { title: new RegExp(keyword, 'i') },
                                    { name: new RegExp(keyword, 'i') },
                                    { description: new RegExp(keyword, 'i') }
                                ];
                            }

                            recommendedProducts = await productsCollection
                                .find(query)
                                .project(projection)
                                .limit(4)
                                .toArray();

                            // Fallback 1: drop price/category, keep keyword
                            if (recommendedProducts.length === 0) {
                                const fallbackQuery = { status: 'published' };
                                if (keyword) {
                                    fallbackQuery.$or = [
                                        { title: new RegExp(keyword, 'i') },
                                        { name: new RegExp(keyword, 'i') },
                                        { description: new RegExp(keyword, 'i') }
                                    ];
                                }
                                recommendedProducts = await productsCollection
                                    .find(fallbackQuery)
                                    .project(projection)
                                    .sort({ createdAt: -1 })
                                    .limit(4)
                                    .toArray();
                            }

                            // Fallback 2: return latest published products
                            if (recommendedProducts.length === 0) {
                                recommendedProducts = await productsCollection
                                    .find({ status: 'published' })
                                    .project(projection)
                                    .sort({ createdAt: -1 })
                                    .limit(4)
                                    .toArray();
                            }

                            // Normalize fields for frontend rendering
                            recommendedProducts = recommendedProducts.map(p => ({
                                _id: p._id,
                                title: p.title || p.name || 'Untitled Product',
                                price: p.price,
                                image: p.images?.[0] || p.image || null,
                                category: p.category || null
                            }));

                            const secondMessages = [
                                ...groqMessages,
                                responseMessage,
                                {
                                    role: 'tool',
                                    tool_call_id: call.id,
                                    name: 'searchProducts',
                                    content: JSON.stringify({ products: recommendedProducts })
                                }
                            ];

                            const secondResponse = await groq.chat.completions.create({
                                model: 'llama-3.3-70b-versatile',
                                messages: secondMessages
                            });

                            textResponse = secondResponse.choices[0].message.content || "";
                        } catch (toolErr) {
                            // Tool execution failed — gracefully fall back to latest products
                            console.error("searchProducts tool execution error:", toolErr.message);
                            const projection = { title: 1, name: 1, price: 1, images: 1, image: 1, category: 1, _id: 1 };
                            recommendedProducts = await productsCollection
                                .find({ status: 'published' })
                                .project(projection)
                                .sort({ createdAt: -1 })
                                .limit(4)
                                .toArray();
                            recommendedProducts = recommendedProducts.map(p => ({
                                _id: p._id,
                                title: p.title || p.name || 'Untitled Product',
                                price: p.price,
                                image: p.images?.[0] || p.image || null,
                                category: p.category || null
                            }));
                            textResponse = "I ran into a small issue searching, but here are some of our latest products you might enjoy!";
                        }
                    }
                }

                res.send({ text: textResponse, products: recommendedProducts });
            } catch (err) {
                console.error("AI Chat Error:", err);
                if (err.status === 429 || (err.message && (err.message.includes('429') || err.message.includes('Quota')))) {
                    return res.send({ text: "I'm currently experiencing high traffic and hit a rate limit. Please wait a moment and try again!", products: [] });
                }
                res.status(500).send({ error: err.message });
            }
        });

        // ─────────────────────────────────────────────
        // LEGACY COMPAT
        // ─────────────────────────────────────────────

        // Keep old purchases endpoint for backward compat (reads from orders collection)
        app.get("/api/purchases/user/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const result = await ordersCollection.find({
                    $or: [{ buyerEmail: email }, { email: email }]
                }).sort({ createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // Keep old products/user/:email for backward compat
        app.get("/api/products/user/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const result = await productsCollection.find({
                    $or: [{ sellerEmail: email }, { creatorEmail: email }]
                }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // await client.db("admin").command({ ping: 1 });
        // console.log("✅ Connected to MongoDB — NexusAI Marketplace Backend Ready");
        
    } finally {
        // await client.close();
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
});