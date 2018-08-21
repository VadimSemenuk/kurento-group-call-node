/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var socket = io('https://' + location.host);
var participants = {};

var gameId = getCookie("gameId");
var participantType = getCookie("participantType");
var participantName = participantType === "player" ? getCookie("playerName") : guid();
var player = getCookie("player");

register(gameId, participantType, participantName, player);

window.onbeforeunload = function () {
	socket.disconnect();
};

socket.on('connect', () => {
	console.log('ws connect success');
});

socket.on('message', parsedMessage => {
	console.info('Received message: ' + parsedMessage.id);

	switch (parsedMessage.id) {
		case 'existingParticipants':
			onExistingParticipants(parsedMessage);
			break;
		case 'newParticipantArrived':
			onNewParticipant(parsedMessage);
			break;
		case 'participantLeft':
			onParticipantLeft(parsedMessage);
			break;
		case 'receiveVideoAnswer':
			receiveVideoResponse(parsedMessage);
			break;
		case 'iceCandidate':
			participants[parsedMessage.name].rtcPeer.addIceCandidate(parsedMessage.candidate, function (error) {
				if (error) {
					console.error("Error adding candidate: " + error);
					return;
				}
			});
			break;
		case 'error':
			alert(parsedMessage.errorMessage);
			break;
		default:
			console.error('Unrecognized message', parsedMessage);
	}
});

function register(gameId, participantType, participantName, player) {
	var message = {
		id: 'joinRoom',
		name: participantName,
		roomName: gameId,
		participantType: participantType,
		player: player
	}

	sendMessage(message);
}

function onNewParticipant(request) {
	if (request.participantType === "spectator") {
		// alert("new spectator arrived");
	} else {
		receiveVideo(request);
	}
}

function receiveVideoResponse(result) {
	participants[result.name].rtcPeer.processAnswer(result.sdpAnswer, function (error) {
		if (error) return console.error(error);
	});
}

function callResponse(message) {
	if (message.response != 'accepted') {
		console.info('Call not accepted by peer. Closing call');
		stop();
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer, function (error) {
			if (error) return console.error(error);
		});
	}
}

function onExistingParticipants(msg) {
	console.log("onExistingParticipants", msg);
	document.getElementById("current-participiant-name").innerText = participantName;

	if (participantType === "spectator") {
		msg.data.filter((a) => a.participantType === "player").forEach(receiveVideo);
		return
	}

	var constraints = {
		audio: true,
		video: {
			mandatory: {
				maxWidth: 320,
				maxFrameRate: 15,
				minFrameRate: 15
			}
		}
	};
	console.log(participantName + " registered in room " + room);
	var participant = new Participant(participantName, participantType, player);
	participants[participantName] = participant;
	var video = participant.getVideoElement();

	var options = {
		localVideo: video,
		mediaConstraints: constraints,
		onicecandidate: participant.onIceCandidate.bind(participant)
	}

	participant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options,
		function (error) {
			if (error) {
				return console.error(error);
			}
			this.generateOffer(participant.offerToReceiveVideo.bind(participant));
		});

	msg.data.filter((a) => a.participantType === "player").forEach(receiveVideo);
}

function leaveRoom() {
	sendMessage({
		'id': 'leaveRoom'
	});

	for (var key in participants) {
		participants[key].dispose();
	}

	document.getElementById('join').style.display = 'block';
	document.getElementById('room').style.display = 'none';

	socket.close();
}

function receiveVideo(sender) {
	console.log("receiveVideoSENDER", sender);

	var participant = new Participant(sender.name, sender.participantType, sender.player);
	participants[sender.name] = participant;
	var video = participant.getVideoElement();

	var options = {
		remoteVideo: video,
		onicecandidate: participant.onIceCandidate.bind(participant)
	}

	participant.rtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
		function (error) {
			if (error) {
				return console.error(error);
			}
			this.generateOffer(participant.offerToReceiveVideo.bind(participant));
		}
	);
}

function onParticipantLeft(request) {
	console.log('Participant ' + request.name + ' left');
	var participant = participants[request.name];
	participant.dispose();
	delete participants[request.name];
}

function sendMessage(message) {
	console.log('Senging message: ' + message.id);
	socket.emit('message', message);
}
