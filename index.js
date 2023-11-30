const PORT = 8000;

const { MongoClient } = require("mongodb");
const { v1: uuidv1 } = require("uuid");

const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { secret } = require("./config.js");

const uri =
    "mongodb+srv://yulyaIgumenova:yulyaIgumenova@toople.xjx3xsj.mongodb.net/?retryWrites=true&w=majority";

const app = express();

app.use(
    cors({
        credentials: true,
    })
);

app.use(express.json());

app.listen(PORT, () => console.log("run", PORT));

app.post("/signup", async (req, res) => {
    const client = new MongoClient(uri);
    const { email, password } = req.body;

    const generatedUserId = uuidv1();
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        client.connect();
        const database = client.db("app-data");
        const users = database.collection("users");

        const existingUser = await users.findOne({ email });

        if (existingUser) {
            return res.status(409).send();
        }
        const sanitizedEmail = email.toLowerCase();

        const data = {
            id: generatedUserId,
            email: sanitizedEmail,
            password: hashedPassword,
        };

        const insertedUser = await users.insertOne(data);

        const token = jwt.sign({ id: generatedUserId }, secret, {
            expiresIn: "24h",
        });

        res.status(201).json([
            {
                token,
                id: generatedUserId,
                email: sanitizedEmail,
            },
        ]);
    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        await client.close();
    }
});

app.post("/login", async (req, res) => {
    const client = new MongoClient(uri);
    const { email, password } = req.body;

    try {
        await client.connect();
        const database = client.db("app-data");
        const users = database.collection("users");

        const user = await users.findOne({ email });

        if (user) {
            const correctPassword = await bcrypt.compare(
                password,
                user.password
            );
            if (correctPassword) {
                const token = jwt.sign({ id: user.id }, secret, {
                    expiresIn: "24h",
                });
                res.status(201).json([{ token, id: user.id, email }]);
            } else {
                res.status(400).send("Неверные данные");
            }
        } else {
            res.status(400).send("Пользователь не найден");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send(err.message);
    } finally {
        await client.close();
    }
});

app.get("/profile/:id", async (req, res) => {
    const client = new MongoClient(uri);
    let userId = req.params.id;
    if (userId === "me") {
        try {
            const token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, secret);
            userId = decoded.id;
        } catch {
            return res.status(200).send();
        }
    }
    try {
        await client.connect();
        const database = client.db("app-data");
        const users = database.collection("users");
        const ad = database.collection("ad");
        const courses = database.collection("course");
        const tasks = database.collection("tasks");

        const queryCompletedTasks = { doerId: userId };

        let TotalTimesCompleted = 0;

        const user = await users.findOne({ id: userId });

        if (!user) {
            return res.status(404).send();
        }

        const userCompletedTasks = await ad.find({ doerId: userId }).toArray();
        const formattedData = {
            name: user.name ? user.name : "Пусто",
            surName: user.surname ? user.surname : "Пусто",
            contacts: user.contacts
                ? user.contacts
                : { value: "Пусто", type: "Пусто" },
            completed: userCompletedTasks
                ? await Promise.all(
                      userCompletedTasks.map(async (completedTask) => {
                          const task = await tasks.findOne({
                              id: completedTask.taskId,
                          });
                          const courseId = task.courseId;
                          const course = await courses.findOne({
                              id: courseId,
                          });
                          TotalTimesCompleted +=
                              completedTask.doerTimesCompleted;
                          return {
                              courseName: course?.name ?? "Пусто",
                              teacherName: course?.teacherName ?? "Пусто",
                              tasks: [
                                  {
                                      taskName: task.name,
                                      timesCompleted:
                                          completedTask.doerTimesCompleted,
                                  },
                              ],
                          };
                      })
                  )
                : undefined,
            timesCompleted: TotalTimesCompleted,
        };
        res.send([formattedData]);
    } finally {
        await client.close();
    }
});

app.get("/courses", async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db("app-data");
        const courses = database.collection("course");
        const tasks = database.collection("tasks");

        const returnedCourses = await courses.find().toArray();

        const formattedData = await Promise.all(
            returnedCourses.map(async (course) => {
                const numberOfTasks = await tasks.countDocuments({
                    courseId: course.id,
                });

                return {
                    id: course.id,
                    name: course.name,
                    teacherName: course.teacherName,
                    numberOfCompletedWorks: numberOfTasks,
                };
            })
        );

        res.send(formattedData);
    } finally {
        await client.close();
    }
});

app.get("/courses/:id", async (req, res) => {
    const client = new MongoClient(uri);
    const courseId = req.params.id;

    let token;
    let userIdFromToken;

    try {
        token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, secret);
        userIdFromToken = decoded.id;
    } catch {
        console.log("no token");
    }

    try {
        await client.connect();
        const database = client.db("app-data");
        const users = database.collection("users");
        const courses = database.collection("course");
        const tasks = database.collection("tasks");
        const customers = database.collection("customers");
        const ad = database.collection("ad");

        const course = await courses.findOne({ id: courseId });

        if (!course) {
            return res.status(404).send("Курс не найден");
        }

        const tasksData = await tasks.find({ courseId: courseId }).toArray();
        const formattedTasks = await Promise.all(
            tasksData.map(async (task) => {
                const taskAds = await ad.find({ taskId: task.id }).toArray();
                const taskAdsData = await Promise.all(
                    taskAds.map(async (adElement) => {
                        const customerArrayForAd = await customers
                            .find({
                                customerId: userIdFromToken
                                    ? userIdFromToken
                                    : "",
                            })
                            .toArray();

                        const allCustomersAds = customerArrayForAd.map(
                            (element) => element.adId
                        );
                        const user = await users.findOne({
                            id: adElement.doerId,
                        });
                        return {
                            id: adElement.id,
                            doerId: adElement.doerId,
                            name: user.name,
                            doerVariantPrice: adElement.doerVariantPrice,
                            customerVariantPrice:
                                adElement.customerVariantPrice,
                            hasCompleted: token
                                ? allCustomersAds.includes(adElement.id)
                                : false,
                        };
                    })
                );
                const numberOfDoers = taskAdsData.length;

                return {
                    id: task.id,
                    name: task.name,
                    numberOfDoers: numberOfDoers,
                    ads: taskAdsData,
                };
            })
        );

        const responseData = {
            courseName: course.name,
            teacherName: course.teacherName,
            tasks: formattedTasks,
        };

        res.send([responseData]);
    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        await client.close();
    }
});

app.get("/fetchTasks", async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const courseId = req.query.courseId;
        const database = client.db("app-data");
        const tasks = database.collection("tasks");

        const tasksArray = await tasks.find({ courseId: courseId }).toArray();
        const tasksData = await Promise.all(
            tasksArray.map(async (task) => {
                return {
                    courseId: courseId,
                    id: task.id,
                    name: task.name,
                };
            })
        );

        res.send(tasksData);
    } catch (err) {
        res.status(500).send();
    } finally {
        await client.close();
    }
});

app.post("/createAd", async (req, res) => {
    const client = new MongoClient(uri);
    try {
        const {
            courseName,
            courseTeacher,
            customerVariantPrice,
            doerVariantPrice,
            taskName,
        } = req.body;
        let { courseId, taskId } = req.body;

        await client.connect();
        const database = client.db("app-data");
        const ads = database.collection("ad");
        const courses = database.collection("course");
        const tasks = database.collection("tasks");

        const course = await courses.findOne({ name: courseName });
        const task = await tasks.findOne({ id: taskId });

        let userIdFromToken;
        const token = req.headers.authorization.split(" ")[1];
        if (!token) {
            res.send("token error");
        }

        try {
            const decoded = jwt.verify(token, secret);
            userIdFromToken = decoded.id;
        } catch {
            res.send("no token");
        }

        if (!course) {
            courseId = uuidv1();
            const courseData = {
                id: courseId,
                name: courseName,
                teacherName: courseTeacher,
            };

            result = await courses.insertOne(courseData);
        }
        if (!task) {
            taskId = uuidv1();

            const taskData = {
                id: taskId,
                name: taskName,
                courseId: courseId,
            };

            result = await tasks.insertOne(taskData);
        }

        const generatedAdId = uuidv1();

        const adData = {
            id: generatedAdId,
            doerId: userIdFromToken,
            taskId: taskId,
            doerTimesCompleted: 0,
            doerVariantPrice: doerVariantPrice,
            customerVariantPrice: customerVariantPrice,
        };
        result = await ads.insertOne(adData);
        res.status(201).send();
    } catch {
        res.status(500).send("Error");
    } finally {
        await client.close();
    }
});

app.post("/markAsCompleted", async (req, res) => {
    const adId = req.body.id;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db("app-data");
        const customer = database.collection("customers");
        const ads = database.collection("ad");
        let userIdFromToken;
        const token = req.headers.authorization.split(" ")[1];

        if (!token) {
            res.status(500).send();
        }

        try {
            const decoded = jwt.verify(token, secret);
            userIdFromToken = decoded.id;
        } catch {
            res.status(500).send();
        }

        const objectToInsert = {
            adId: adId,
            customerId: userIdFromToken,
        };
        const result = await customer.insertOne(objectToInsert);
        const update = {
            $inc: {
                doerTimesCompleted: 1,
            },
        };
        const resultAd = await ads.updateOne({ id: adId }, update);
        res.status(201).send();
    } catch {
        res.status(500).send("Error");
    } finally {
        await client.close();
    }
});

app.post("/editProfile", async (req, res) => {
    const receivedData = req.body;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db("app-data");
        const users = database.collection("users");

        let userIdFromToken;
        const token = req.headers.authorization.split(" ")[1];
        if (!token) {
            res.status(401).send("token error");
        }

        try {
            const decoded = jwt.verify(token, secret);
            userIdFromToken = decoded["id"];
        } catch {
            res.status(401).send("token error");
        }

        const user = await users.findOne({ id: userIdFromToken });
        const update = {
            $set: {
                name: receivedData.name,
                surname: receivedData.surName,
                contacts: {
                    type: receivedData["contacts"]["type"],
                    value: receivedData["contacts"]["value"],
                },
            },
        };
        const result = await users.updateOne({ id: userIdFromToken }, update);
        res.status(201).send();
    } catch (error) {
        res.status(500).send("Error");
    } finally {
        await client.close();
    }
});
