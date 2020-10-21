#!/usr/bin/env node

const Discord = require('discord.js');
const client = new Discord.Client();

var process = require('process');

var Sequelize = require('sequelize');
const Op = Sequelize.Op;

const { exec } = require("child_process");

var pin_http = require("./pin_http");

var interval = undefined;

var MENTION_STRING = "pin "; // "<@!763803843074719794>";

var seq = new Sequelize('sqlite:db.sqlite3');

var emoji_name = "like";

var Alias = seq.define('alias', {
    guild: { type: Sequelize.STRING },
    shortname: { type: Sequelize.STRING },
});

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
  pin_http.server(client, Pin, Alias);
});

Pin.sync().then(function() {
    console.log("Table created");
});

Alias.sync().then(function() {
    console.log("Alias table created");
});

var deletePin = function(orig_message, guild, channel, pinner, desired_message_id) {
  channel.messages.fetch(desired_message_id).then(function(message) {
      Pin.findOne({
        where: {
            guild: guild.id,
            channel: channel.id,
            message: message.id
        }
      }).then(function(row) {
        if (!row) {
            channel.send("Pin does not exist");
            return;
        }
        row.destroy();
        var emoji_id = client.emojis.cache.find(emoji => emoji.name == emoji_name);
        if (!emoji_id) {
            channel.send("Unpinned " + desired_message_id);
        } else {
            orig_message.react(emoji_id).catch(function(e) {
                channel.send("Unpinned " + desired_message_id);
            });;
        }
      });
  }).catch(function() {
    channel.send("Could not find pin " + desired_message_id);
  });
};

var pin = function(orig_message, guild, channel, pinner, desired_message_id) {
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
            var emoji_id = client.emojis.cache.find(emoji => emoji.name == emoji_name);
            if (!emoji_id) {
                channel.send("Pinned http://pins.jhoughton.me/" + guild.id + "/" + channel.id + "/" + message.id);
            } else {
                orig_message.react(emoji_id).catch(function(e) {
                    console.log("Could not react: " + e);
                });
            }
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
  if(!lower.startsWith(MENTION_STRING)) {
    if (lower == "pin") {
        message.channel.messages.fetch({ limit: 2 }).then(function(messages) {
          console.log(messages);
          for (let msg of messages.values()) {
              if (msg.id != message.id) {
                pin(message, message.channel.guild, message.channel, message.author, msg.id);
                break;
              }
          }
        });
        return;
    }
    if (!lower.startsWith("unpin")) return;
      // unpin
      var del_pin = lower.substring("unpin".length).trimLeft().trimRight();
      deletePin(message, message.channel.guild, message.channel, message.author, del_pin);
      return;
  }
  var pin_id = lower.substring(MENTION_STRING.length).trimLeft().trimRight();
  if (pin_id == "list") {
    message.channel.send("Pins can be found here: http://pins.jhoughton.me/" + message.channel.guild.id + "/" + message.channel.id + "/");
    return;
  }
  if (pin_id.startsWith("alias")) {
    var desired_alias = pin_id.substring("alias".length).trimLeft();
    Alias.findOne({
        where: { [Op.or]: [
                { guild: message.channel.guild.id },
                { shortname: desired_alias }
            ]}
    }).then(function(alias_row) {
        if (alias_row) {
            message.channel.send("Alias already exists for this server or the alias is taken.");
        } else {
            Alias.create({
                guild: message.channel.guild.id,
                shortname: desired_alias
            }).then(function() {
                message.channel.send("Alias created");
            });
        }
    }).catch(function(e) {
        console.log("Error executing query: " + e);
    });
    return;
  } else {
      pin(message, message.channel.guild, message.channel, message.author, pin_id);
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
