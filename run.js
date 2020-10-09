#!/usr/bin/env node

const Discord = require('discord.js');
const client = new Discord.Client();

var process = require('process');

var Sequelize = require('sequelize');

const { exec } = require("child_process");

var pin_http = require("./pin_http");

var interval = undefined;

var MENTION_STRING = "pin"; // "<@!763803843074719794>";

var seq = new Sequelize('sqlite:db.sqlite3');

var Pin = seq.define('pin', {
    guild: { type: Sequelize.STRING },
    channel: { type: Sequelize.STRING },
    pinner: { type: Sequelize.STRING },
    author: { type: Sequelize.STRING },
    pinner_name: { type: Sequelize.STRING },
    author_name: { type: Sequelize.STRING },
    message: { type: Sequelize.STRING },
    content: { type: Sequelize.STRING }
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  pin_http.server(client, Pin);
});

Pin.sync().then(function() {
    console.log("Table created");
});

var pin = function(guild, channel, pinner, desired_message_id) {
  channel.messages.fetch(desired_message_id).then(function(message) {
      Pin.findOne({
        where: {
            guild: guild.id,
            channel: channel.id,
            message: message.id
        }
      }).then(function(exists) {
        if (exists) { 
            channel.send("Already pinned http://pins.jhoughton.me/" + guild.id + "/" + channel.id + "/" + message.id);
            return;
        }
        Pin.create({
          guild: guild.id,
          channel: channel.id,
          pinner: pinner.id,
          author: message.author.id,
          author_name: message.author.username,
          pinner_name: pinner.username,
          content: message.content,
          message: message.id
        }).then(function() {
            channel.send("Pinned http://pins.jhoughton.me/" + guild.id + "/" + channel.id + "/" + message.id);
        });
      });
  }).catch(function(e) {
    channel.send("Couldn't pin: `" + desired_message_id + "`");
  });
}

client.on("message", async message => {
  if(message.channel.type == 'dm') return;
  if(message.author.bot) return;
  var lower = message.content.toLowerCase();
  if(!lower.startsWith(MENTION_STRING)) return;
  var pin_id = lower.substring(MENTION_STRING.length).trimLeft().trimRight();
  if (pin_id == "list") {
    message.channel.send("Pins can be found here: http://pins.jhoughton.me/" + message.channel.guild.id + "/" + message.channel.id + "/");
    return;
  }
  if (pin_id == "") {
    message.channel.messages.fetch({ limit: 2 }).then(function(messages) {
      console.log(messages);
      for (let msg of messages.values()) {
          if (msg.id != message.id) {
            pin(message.channel.guild, message.channel, message.author, msg.id);
            break;
          }
      }
    });
  } else {
      pin(message.channel.guild, message.channel, message.author, pin_id);
  }
});

client.on('shardError', function(e) {
  console.error('Got shardError: ' + e);
});

client.on('error', function(e) { console.log(e); });

process.on('unhandledRejection', function(e) {
  console.error('Unhandled rejection: ' + e);
});

if (!process.env.BOT) {
    console.error("Give bot token as BOT env var please");
    process.exit(1);
}

client.login(process.env.BOT).catch(function(e) {
  console.error('Caught error ' + e);
}).then(function(e) {
  console.log(e);
});

console.log("Sent login request");
