require('@tensorflow/tfjs-backend-cpu'),
    require('@tensorflow/tfjs-backend-webgl');
const tfnode = require('@tensorflow/tfjs-node');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const mobilenet = require('@tensorflow-models/mobilenet');
const fs = require('fs');
var modelMobilenet = null,
    modelCocossd = null;
mobilenet.load().then((modelLoaded) => {
    modelMobilenet = modelLoaded;
});
cocoSsd.load().then((modelLoaded) => {
    modelCocossd = modelLoaded;
});


module.exports.identifyObjects = function(imgUrl) {
    return new Promise(async function(resolve, reject) {
        const tensor = await tfnode.node.decodeImage(fs.readFileSync(imgUrl));
        if (modelCocossd == null || modelMobilenet == null) {
            return resolve(null);
        }

        modelCocossd.detect(tensor).then((predCoco) => {
            modelMobilenet.classify(tensor).then((predMob) => {
                return resolve(formatPredictions(predCoco.concat(predMob)));
            }).catch((err) => {
                return resolve(formatPredictions(predCoco));
            });
        }).catch((err) => {
            return resolve(null);
        });
    });
};

function formatPredictions(preds) {
    var res = [];
    if (preds && preds != null && preds.length > 0) {
        for (var x = 0; x < preds.length; x++) {
            if (preds[x].hasOwnProperty('probability') && preds[x].probability > 0.2) {
                res.push({
                    class: preds[x].className,
                    score: preds[x].probability
                });
            } else if (preds[x].hasOwnProperty('score') && preds[x].score > 0.2) {
                res.push(preds[x]);
            }
        }
    }
    return res.length > 0 ? res : null;
}