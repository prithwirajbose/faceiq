require('@tensorflow/tfjs-node-gpu');
const path = require('path');
const express = require('express');
var WebSocket = require('ws'),
    fs = require('fs'),
    app = express(),
    canvas = require('canvas'),
    faceapi = require('@vladmandic/face-api'),
    sqlite3 = require('sqlite3'),
    objectiq = require('./objectiq'),
    cookieParser = require('cookie-parser');
require('dotenv').config();
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const WS_PORT = process.env.WS_PORT || 9090;
const HTTP_PORT = process.env.HTTP_PORT || 8080;

app.use(cookieParser());
app.use(function(req, res, next) {
    res.cookie('WS_URL', process.env.WS_URL);
    next();
});

app.use(express.static('public'));

const descriptions = [];

let db = new sqlite3.Database('./facedata.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    //console.log('Connected to the FaceIQ database.');
});

const wsServer = new WebSocket.Server({ port: WS_PORT }, () => console.log(`WS server is listening at ws://localhost:${WS_PORT}`));

// array of connected websocket clients
let isTraining = false;
let faceMatcher = null;
let personData = {};
let connectedClients = [];

loadModels();
loadFaceMatcher();

wsServer.on('connection', (ws, req) => {
    // add new connected client
    connectedClients.push(ws);
    // listen for messages from the streamer, the clients will not send anything so we don't need to filter
    ws.on('message', data => {
        // send the base64 encoded frame to each connected ws
        connectedClients.forEach((ws, i) => {
            if (ws.readyState === ws.OPEN) { // check if it is still connected
                (async function() {
                    var trainingDone = false;
                    var inData = JSON.parse(data.toString());
                    if (inData.train === true && inData.personName != '' && !isTraining) {
                        //console.log("Incoming face...");
                        const faceData = await extractFaceData(inData.data, inData.personName, ws);
                    } else {
                        //console.log("Incoming face for search...");
                        const faceData = await identifyFace(inData.data, ws);
                    }
                })();

            } else { // if it's not connected remove from the array of connected ws
                connectedClients.splice(i, 1);
            }
        });
    });
});

function loadFaceMatcher() {
    faceMatcher = null;
    personData = {};
    var personName = '';
    var pData = [];
    db.all("select f.data as data, p.personName, p.personId from person p, face_data f where f.personId=p.personId order by p.personId", async(err, rows) => {
        var tempArr = [];
        rows.forEach((row, indv) => {
            var tempPersonName = row.personName;
            personData[tempPersonName] = row.personId;
            if (personName != tempPersonName && personName != '') {
                pData.push(new faceapi.LabeledFaceDescriptors(personName, tempArr));
                tempArr = [];
            } else {
                tempArr.push(new Float32Array(Object.values(JSON.parse(row.data))));
            }
            personName = tempPersonName;
        });
        //console.log("Face data loaded!");
        pData.push(new faceapi.LabeledFaceDescriptors(personName, tempArr));
        faceMatcher = new faceapi.FaceMatcher(pData, 0.6);
    });
}

async function identifyFace(faceImg, ws) {
    var base64Data = faceImg.replace(/^data:image\/jpeg;base64,/, "");
    var rand = (new Date()).getTime();
    if (fs.existsSync(rand + "temp.jpg"))
        fs.unlinkSync(rand + "temp.jpg");
    fs.writeFileSync(rand + "temp.jpg", base64Data, 'base64');
    //console.log("Find Face image saved!");
    try {
        const img = await canvas.loadImage(rand + "temp.jpg");
        var objectData = null;
        objectiq.identifyObjects(rand + "temp.jpg").then((objRes) => {
            objectData = objRes;
        });
        const displaySize = { width: 480, height: 320 };
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true).withFaceDescriptors().withFaceExpressions().withAgeAndGender();
        const detectionsForSize = await faceapi.resizeResults(detections, displaySize);
        const canvasNew = await canvas.createCanvas(480, 320);
        const canvImage = await faceapi.draw.drawDetections(canvasNew, detectionsForSize, { withScore: false, withLabel: true });
        const results = detectionsForSize.map((d) => { return { matchData: faceMatcher.findBestMatch(d.descriptor), emotion: d.expressions, gender: d.gender, age: d.age }; });
        //console.log("Face identified!");
        ws.send(JSON.stringify({ data: results, objectData: objectData, train: false, personName: '', img: canvasNew.toDataURL() }));
    } catch (e) {
        //console.log(e);
    } finally {
        fs.unlinkSync(rand + "temp.jpg");
    }
    return null;
}

async function extractFaceData(faceImg, personName, ws) {
    isTraining = true;
    var ret = null;
    var base64Data = faceImg.replace(/^data:image\/jpeg;base64,/, "");
    var rand = (new Date()).getTime();
    if (fs.existsSync(rand + "temp.jpg"))
        fs.unlinkSync(rand + "temp.jpg");
    fs.writeFileSync(rand + "temp.jpg", base64Data, 'base64');

    // console.log("Face Saving Start!");
    try {
        const img = await canvas.loadImage(rand + "temp.jpg");
        const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true).withFaceDescriptor();
        if (detections && detections != null) {
            ret = detections.descriptor;
            ws.send(JSON.stringify({ data: null, trainDone: true, personName: personName }));
            saveFaceToDb(JSON.stringify(ret), personName);
            isTraining = false;
            return ret;
        } else {
            isTraining = false;
            return null;
        }
    } catch (e) {
        console.log(e);
        isTraining = false;
        return null;
    } finally {
        fs.unlinkSync(rand + "temp.jpg");
    }
}

async function loadModels() {
    await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.tinyFaceDetector.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.faceExpressionNet.loadFromDisk(__dirname + "/public/models");
    await faceapi.nets.ageGenderNet.loadFromDisk(__dirname + "/public/models");
}

async function saveFaceToDb(data, person) {
    if (personData != null && Object.keys(personData).length > 0 && personData.hasOwnProperty(person)) {
        //console.log("Face Searched! Person Found!");personId = personData[person];
        personId = personData[person];
        db.run(`insert into face_data (personId,data) VALUES(?,?)`, [personId, data], (err) => {
            loadFaceMatcher();
        });
        //console.log("Existing person face data saved");

    } else {
        //console.log("Face Searched! Person Not Found!");
        db.run(`insert into person (personName,personFeatures) VALUES(?,?)`, [person, null], function(err) {
            personId = this.lastID;
            db.run(`insert into face_data (personId,data) VALUES(?,?)`, [personId, data], (err) => {
                loadFaceMatcher();
            });
            //console.log("New person face data saved");
        });
    }
}


// HTTP stuff
app.get('/client', (req, res) => res.sendFile(path.resolve(__dirname, './public/client.html')));
app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, './public/server.html')));
app.listen(HTTP_PORT, () => console.log(`HTTP server listening at http://localhost:${HTTP_PORT}`));

module.exports = this;