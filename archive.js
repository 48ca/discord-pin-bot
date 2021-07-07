#!/usr/bin/env node

const Discord = require('discord.js');
const client = new Discord.Client();

const fs = require('fs');
const https = require('https');
const process = require('process');

var Sequelize = require('sequelize');
const Op = Sequelize.Op;

var seq = new Sequelize('sqlite:db.sqlite3');

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

var Tag = seq.define('tag', {
    text: { type: Sequelize.STRING }
}, { timestamps: false });

writeMeta = function(pin, fn) {
}

client.login(process.env.BOT).catch(function(e) {
  console.error('Caught error ' + e);
}).then(async function(e) {
  var pins = await Pin.findAll();
  var run = async function(pin) {
      var guild_id = pin.guild;
      var channel_id = pin.channel;
      var message_id = pin.message;
      var dir = `archive/${guild_id}/${channel_id}/${message_id}`;
      if (fs.existsSync(dir)) {
        console.log("Skipping ", dir);
        return;
      }
      fs.mkdirSync(dir, { recursive: true });
      console.log(pin.id, pin.pinner_name, guild_id, channel_id, message_id);
      
      fs.writeFile(`${dir}/raw.json`, JSON.stringify(pin, null, 4), function(err) {
          if (err) {
              console.log("Error writing raw.json for pin", pin.id, err);
          }
      });

      var guild = client.guilds.cache.get(guild_id);
      if (!guild) {
          console.warn("Could not find guild:", guild_id);
          return;
      }

      var pinner_user = await guild.members.fetch(pin.pinner).catch(function (err) {
        console.warn("Unknown user:", pin.pinner, err);
      });
      if (pinner_user) {
          fs.writeFile(`${dir}/pinner.json`, JSON.stringify(pinner_user.user, null, 4), function(err) {
              if (err) {
                  console.warn("Failed writing pinner.json", message_id, err);
              }
          });
      }
      var author_user = await guild.members.fetch(pin.author).catch(function (err) {
        console.warn("Unknown user:", pin.author, err);
      });
      if (author_user) {
          fs.writeFile(`${dir}/author.json`, JSON.stringify(author_user.user, null, 4), function(err) {
              if (err) {
                  console.log("Error writing author.json for pin", pin.id, err);
              }
          });
      }

      var channel = guild.channels.cache.get(channel_id);
      if (!channel) {
          console.warn("Could not find channel:", channel_id);
          return;
      }

      var message = await channel.messages.fetch(message_id).catch(function(err) {
        console.warn("Could not find message:", message_id);
      });
      if (!message) {
          fs.writeFile(`${dir}/DELETED`, "", function(err) { if (err) { console.log("Error writing DELETED file: ", err); }});
          return;
      }
      fs.writeFile(`${dir}/content.txt`, message.content, function(err) {
          if (err) {
              console.warn("Failed writing content.txt", message_id, err);
          }
      });
      if (message.attachments.size > 0) {
          var a_dir = `${dir}/attachments`;
          fs.mkdirSync(a_dir, { recursive: true });
          for (let a of message.attachments.values()) {
              let fn = a.name;
              var real_fn = `${a_dir}/${fn}`;
              var file = fs.createWriteStream(real_fn);
              var prom = new Promise(function(resolve, reject) {
                  var req = https.get(a.url, function(resp) {
                      resp.pipe(file);
                      file.on('finish', function() {
                          file.close(function() {
                              console.log("Finished writing attachment:", message_id, fn);
                          });
                          resolve();
                      });
                  }).on('error', function(err) {
                      fs.unlink(real_fn);
                      console.log("Failed to write attachment:", message_id, fn);
                      reject();
                  });
              });
              await prom;
          }
      }
  };
  for (let pin of pins) {
    await run(pin);
  }
  console.log("Finished pins");
  console.log(e);
  process.exit(0);
});

console.log("Sent login request");
