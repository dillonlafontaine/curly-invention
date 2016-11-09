$(() => {
  let $body = $('body');
  let $head = $('head');
  let fileVersionNumber = '20';

  $head.append(`<link rel="stylesheet" href="main.css?v=${fileVersionNumber}" media="screen">`);
  $body.append(`<script src="client.js?v=${fileVersionNumber}">`);
});
