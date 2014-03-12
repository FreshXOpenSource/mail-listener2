var Imap = require('imap');
var util = require('util');
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var MailParser = require("mailparser").MailParser;

module.exports = MailListener;

function MailListener(options) {
  this.markSeen = !!options.markSeen;
  this.mailbox = options.mailbox || "INBOX";
  this.searchFilter = options.searchFilter || "UNSEEN";
  this.fetchUnreadOnStart = !!options.fetchUnreadOnStart;
  this.mailParserOptions = options.mailParserOptions || {},
  this.imap = new Imap({
    xoauth2: options.xoauth2,
    user: options.username,
    password: options.password,
    host: options.host,
    port: options.port,
    tls: options.tls,
    tlsOptions: options.tlsOptions || {}
  });
  
  this.imap.on('ready', imapReady.bind(this));
  this.imap.on('close', imapClose.bind(this));
  this.imap.on('error', imapError.bind(this));
}

util.inherits(MailListener, EventEmitter);

MailListener.prototype.start = function() {
  this.imap.connect();
};

MailListener.prototype.stop = function() {
  this.imap.end();
};

function imapReady() {
  var self = this;
  this.imap.openBox(this.mailbox, false, function(err, mailbox) {
    if(err) {
      self.emit('error',err);
    } else {
      self.emit('server:connected');
      if(self.fetchUnreadOnStart) {
        parseUnread.call(self);
      }
      self.imap.on('mail', imapMail.bind(self));
    }
  });
}

function imapClose() {
  this.emit('server:disconnected');
}

function imapError(err) {
  this.emit('error',err);
}

function imapMail() {
  parseUnread.call(this);
}

function parseUnread() {
  var self = this;
  this.imap.search([ self.searchFilter ], function(err, results) {
    if (err) {
      self.emit('error',err);
    } else if(results.length > 0) {
      async.eachSeries(results, function(uid, callback){
        var f = self.imap.fetch([uid], { bodies: '', markSeen: self.markSeen });
        f.on('message', function(msg, seqno) {
          var parser = new MailParser(self.mailParserOptions);
          var mail
          var attributes
          parser.on("end", function(m) {
            mail = m
            if(attributes) {
              self.emit('mail', mail, attributes);
              callback();
            }
          });
          msg.once('body', function(stream, info) {
            stream.pipe(parser);
          });
          msg.once('attributes', function(attrs) {
            attributes = attrs
            if(mail) {
              self.emit('mail', mail, attributes);
              callback();
            }
          })
        });
        f.once('error', function(err) {
          self.emit('error',err);
          callback();
        });
      });
    }
  });
}
