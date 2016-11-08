$(document).ready(function() {
  "use strict"

  let socket = io('https://socket-io-testing-ezenith.c9users.io/', {
    reconnectionAttempts: 3
  });
  let $form = $('.chat-form > input[type=submit]');
  let $chatList = $('.chat-list');
  let $userlist = $('.user-list');
  let $messageEl = $('.chat-form > input[type=text]');


  socket.on('messageHandler', function(data) {
    chatMessage(data);
  });

  socket.on('populateUserlist', function(data) {
    $userlist.html('');
    $userlist.append(data);
  });

  socket.on('reconnect_attempt', function(data) {
    if (data === 1) {
      chatMessage(`<span class='server-message'>Attempting to connect to server...</span>`);
    } else if (data === 3) {
      chatMessage(`<span class='server-message'>Could not connect to server.</span>`);
    }
  });

  socket.on('kickModal', function(data) {
    // data.header
    // data.body
    let $body = $('body');
    $body.append(`<section class="modal">
                    <div class="modal-message">
                      <h2 class="modal-message-header">${data.header}</h2>
                      <p class="modal-message-body">${data.body}</p>
                    </div>
                  </section>`);
  });

  socket.on('closeLoadModal', function() {
    $('.loadModal').remove();
  });

  $form.on('click', function(e) {
    socket.emit('chatMessage', $messageEl.val());
    $messageEl.val('');
    return false;
  });

  function chatMessage (message) {
    $chatList.append($('<li class="chat-list-item">').html(message));
    updateScroll();
  }

  function updateScroll() {
    let scrollEl = document.querySelector('.chat-list');
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  $userlist.on('click', function(e) {
    let username = e.target.innerText;
    if ($messageEl.val() === '') {
      $messageEl.focus().val(`/msg ${username} `);
    }
  });
});
