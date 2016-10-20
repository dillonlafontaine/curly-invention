"use strict"

let sandboxd = require('sandboxd');
let config_sandboxd = require('./config_sandboxd');
let path = require('path');
let url = require('url');
let sani = require('sanitize-html');
let express = require('express');
let app = express();
let http = require('http').Server(app);
let port = process.env.PORT;
let host = process.env.IP;
let io = require('socket.io')(http);

// URL query
let query = '';

// Sandboxd game variables
let GAME_ID = config_sandboxd.game_id;
let GAME_KEY = config_sandboxd.game_key;

sandboxd.init(GAME_ID, GAME_KEY);

//Chat Globals
let users = {};
let bannedIPList = [];
let bannedUsernames = [];
let roomList = ['Lobby', 'The Void'];
let administrators = ['ezenith'];
let moderators = [];
let guestIn = 0;

app.get('/chatapp/:uid', function(req, res) {
	res.header('Access-Control-Allow-Origin', 'https://g223.sandboxd.com/');
	res.header('Access-Control-Allow-Credentials', 'true');
    res.end('hello');
});

io.on('connection', function(socket) {
	query = url.parse(socket.handshake.headers.referer, true).query;
	let user_uid = query.uid || 0;
	let user_sid = query.sid || 0;
	let username = 'Guest';
	let displayName = 'Guest';
	let accessLevel = 1; // Access levels range from 1 - 5 (1: Guest, 2: User, 3: Room Host, 4: Server Moderator, 5: Server Administrator)
	let timeOfLastMessage = 0;
	let messageMinLength = 1;
	let messageMaxLength = 200;

	//AUTH BULLSHIT
	sandboxd.verifyUser(user_uid, user_sid, function (err, data) {

		// For account ezenith for TESTING ONLY.
		if (user_uid === '317' && user_sid === '1337') {
			err = null;
		}

		if (err == null) {
			//Authentication successful
			sandboxd.getUser(user_uid, function (err, data) { // One day I'll handle this error. One day.

				// Check if that USERNAME is already logged in.
				// If so, disconnect THIS socket.
				if (users[data.name.toLowerCase()]) {
					socket.emit('kickModal', { header: 'You have been kicked!', body: `Server has kicked you for the following reason: You are already logged in on this account!` });
					socket.disconnect();
					return;
				}

				// Check if IP is already in use.
				// If so, disconnect THIS socket.
				for (let user in users) {
					if (users[user].ipaddress === socket.handshake.headers['x-forwarded-for']) {
						socket.emit('kickModal', { header: 'You have been kicked!', body: `Server has kicked you for the following reason: You are already logged in with this IP address!` });
						socket.disconnect();
						return;
					}
				}

				// Check if IP is in the banned IP's list
				// If so, block connection.
				if (bannedIPList.indexOf(socket.handshake.headers['x-forwarded-for']) != -1) {
					socket.emit('kickModal', { header: 'You have been kicked!', body: `Server has kicked you for the following reason: It appears that you are trying to connect from a banned IP address.` });
					socket.disconnect();
					return;
				}

				if (bannedUsernames.indexOf(data.name.toLowerCase()) != -1) {
					socket.emit('kickModal', { header: 'You have been kicked!', body: `Server has kicked you for the following reason: Your username appears to be banned.` });
					socket.disconnect();
					return;
				}

				displayName = data.name;
				username = displayName.toLowerCase();

				if (username === 'guest' && user_uid === 0) {
				    username = `${username}(${guestIn})`;
				    displayName = `Guest(${guestIn})`;
				    guestIn++;
				} else {
					accessLevel = 2;
				}

				users[username] = socket;
				users[username].displayName = displayName;
				users[username].ipaddress = users[username].handshake.headers['x-forwarded-for'];

				if (moderators.indexOf(username) != -1) {
					accessLevel = 4;
				} else if (administrators.indexOf(username) != -1) {
					accessLevel = 5;
				}

				users[username].accessLevel = accessLevel;

				socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Welcome to the server, ${displayName}!` }));
				console.log(`${displayName} connected to the server.`);
				io.emit('populateUserlist', userlistHandler());
				socket.emit('closeLoadModal');
			});
			return true;
		} else {
			//Authentication failed
			socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: 'We were unable to verify your account. You have been disconnected.' }));
			socket.disconnect();
			return false;
		}
	});
	// END AUTH BULLSHIT

	socket.on('chatMessage', function(data) {
		data = sani(data, {allowedTags: []});
		if (Date.now() >= (timeOfLastMessage + 1000)) {
			if (data.length >= messageMinLength && data.length <= messageMaxLength) {
				if (data.charAt(0) === '/') {
					data = data.split(' ');
					let message = '';
					let targetUser = '';
					switch(data[0]) {
					    // START OF /MSG CASE
						case '/msg':
							targetUser = data[1] || '';
							targetUser = targetUser.toLowerCase();
							if (users[targetUser]) {
								data.splice(0, 2);
								data = data.join(' ');
								socket.emit('messageHandler', messageHandler({ type: 'privatemessageto', targetUser: users[targetUser].displayName, messageContent: data }));
								io.to(users[targetUser].id).emit('messageHandler', messageHandler({ type: 'privatemessagefrom', username: displayName, messageContent: data }));
								users[targetUser].replyUser = username;
								timeOfLastMessage = Date.now();
								console.log(`(${username} > ${targetUser}): ${data}`);
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: 'The user you are trying to message is not currently online.' }));
							}
							break;
						// END OF /MSG CASE
						case '/reply':
						case '/r':
							if (users[users[username].replyUser]) {
								data.splice(0, 1);
								data = data.join(' ');
								socket.emit('messageHandler', messageHandler({ type: 'privatemessageto', targetUser: users[username].replyUser, messageContent: data }));
								io.to(users[users[username].replyUser].id).emit('messageHandler', messageHandler({ type: 'privatemessagefrom', username: displayName, messageContent: data }));
								timeOfLastMessage = Date.now();
								console.log(`(${username} > ${users[username].replyUser}): ${data}`);
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: 'The user you are trying to message is not currently online; or no user has sent a message for you to reply to.' }));
							}
							break;
						case '/kick':
						case '/k':
						    if (users[username].accessLevel >= 4) {
    						    targetUser = data[1] || '';
    						    targetUser = targetUser.toLowerCase();
    						    if (users[targetUser]) {
    						        data.splice(0, 2);
    						        data = data.join(' ');
    						        io.emit('messageHandler', messageHandler({ type: 'kickmessage', username: displayName, targetUser: users[targetUser].displayName, messageContent: data }));
    						        io.to(users[targetUser].id).emit('kickModal', { header: 'You have been kicked!', body: `${displayName} has kicked you from the server for the following reason: "${data}"` });
    						        console.log(`${displayName} kicked ${users[targetUser].displayName} (${data})`);
    						        io.sockets.sockets[users[targetUser].id].disconnect();
    						    } else {
    						    	socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: 'The user you are trying to kick is not currently online.' }));
    						    }
						    } else {
						        socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 4 or great is required for this command. Your access level is ${users[username].accessLevel}.` }));
						    }
						    break;
						case '/ban':
						case '/b':
							if (users[username].accessLevel >= 4) {
								if(data[1]) {
									targetUser = data[1];
									targetUser = targetUser.toLowerCase();
									bannedUsernames.push(targetUser);
									socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `User "${targetUser}" has been banned successfully.` }));
								}
							} else {
						        socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 4 or great is required for this command. Your access level is ${users[username].accessLevel}.` }));
							}
							break;
						case '/users':
							if(users[username].accessLevel >= 4) {
								let tempList = ['Users Online:'];
								for(let user in users) {
									tempList.push(`${user} (${users[user].handshake.headers['x-forwarded-for']})`);
								}
								tempList = tempList.join(' -- ');
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: tempList }));
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 4 or great is required for this command. Your access level is ${users[username].accessLevel}.` }));
							}
							break;
						case '/announce':
							if(users[username].accessLevel === 5) {
								data.splice(0, 1);
								data = data.join(' ');
								io.emit('messageHandler', messageHandler({ type: 'staffannouncemessage', username: displayName,  messageContent: data }));
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 5 is required for this command. Your access level is ${users[username].accessLevel}.` }));
							}
							break;
						case '/gannounce':
							if(users[username].accessLevel === 5) {
								data.splice(0, 1);
								data = data.join(' ');
								io.emit('messageHandler', messageHandler({ type: 'systemannouncemessage', messageContent: data }));
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 5 is required for this command. Your access level is ${users[username].accessLevel}.` }));
							}
							break;
						case '/revoke':
							if(users[username].accessLevel === 5){
								targetUser = data[1].toLowerCase();
								users[targetUser].accessLevel = 2; // Set access level to 2: User
								if (moderators.indexOf(targetUser) !== -1) {
									moderators.splice(moderators.indexOf(targetUser), 1);
								} else if (administrators.indexOf(targetUser) !== -1) {
									administrators.splice(administrators.indexOf(targetUser), 1);
								}
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `User '${targetUser}' has successfully had their access revoked.` }));
								io.to(users[targetUser].id).emit('messageHandler', messageHandler({ type: 'server', messageContent: `Your status has been temporarily revoked by '${username}'.` }));
							} else {
								socket.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Access level 5 is required for this command. Your access level is ${users[username].accessLevel}.` }));
							}
							break;
						default:
							io.emit('messageHandler', messageHandler({ type: 'server', messageContent: `Command Error: Type '/help' for a list of available commands. (/help isn't currently available)` }));
					}
					return;
				}
				console.log(`${username}: ${data}`);
				io.emit('messageHandler', messageHandler({ type: users[username].accessLevel, username: displayName, messageContent: data }));
				timeOfLastMessage = Date.now();
			}
		}
	});

	socket.on('disconnect', function() {
		socket.emit({ type: 'server', messageContent: 'You have disconnected from the server.' });
		console.log(`${username} has disconnected from the server.`);
		delete users[username];
		io.emit('populateUserlist', userlistHandler());
	});
});

function messageHandler (data) {

    /*
        Data Object to pass for messages to work:
        {
            type: '',          // A string containing the type of message to be used.
                                  the switch statement below shows all current available types.

            username: '',      // A string containing the username of the user submitting
                                  the message.

            targetUser: '',    // A string containing the user you are targeting with
                                  a comment of some sort.

            messageContent: '' // A string containing the content of the message
                                   you are trying to pass.
        }
    */

	let message = '';

	switch (data.type) {
		case 1:
		case 2:
		case 3: // Access levels 1 / 2 / 3 = Guest / User / Room Host
			message = `<span class="chat-message">${data.username}: ${data.messageContent}</span>`;
			break;
		case 4: // Access levels 4 = Server Moderator
			message = `<span class="staff-message mod">${data.username}: ${data.messageContent}</span>`;
			break;
		case 5: // Access levels 5 = Server Administrator
			message = `<span class="staff-message admin">${data.username}: ${data.messageContent}</span>`;
			break;
		case 'server':
			message = `<span class="server-message">${data.messageContent}</span>`;
			break;
		case 'privatemessagefrom':
			message = `<span class="private-message">From ${data.username}: ${data.messageContent}</span>`;
			break;
		case 'privatemessageto':
			message = `<span class="private-message">To ${data.targetUser}: ${data.messageContent}</span>`;
			break;
		case 'kickmessage':
		    message = `<span class="kick-message">${data.username} has kicked ${data.targetUser} (${data.messageContent})</span>`;
		    break;
		case 'staffannouncemessage':
			message = `<span class="announce-message">Announcement from ${data.username}: ${data.messageContent}</span>`;
			break;
		case 'systemannouncemessage':
			message = `<span class="system-announce-message">System Announcement: ${data.messageContent}</span>`;
			break;
	}
	return message;
}

function userlistHandler() {
	let userlist = '';
	for (let user in users) {
		userlist += `<li class="user-list-item">${users[user].displayName}</li>`;
	}
	return userlist;
}

http.listen(port, host, function() {
	console.log(`HTTP: Listening on port: ${port}`);
	console.log(`HTTP: Host: ${host}`);
});
