/**
 * StuntListing Bookkeeper — Gmail intake.
 *
 * Runs inside the intake Gmail account on a time trigger. Every unread
 * inbox thread is forwarded to the Bookkeeper's inbound endpoint, one
 * message at a time, and the thread is labeled with what happened:
 *   processed  — attachments landed in the sender's account
 *   unmatched  — we do not know that sender's address
 *   failed     — something else went wrong; it will NOT be retried,
 *                look at it by hand
 */

var ENDPOINT = "https://rate-calculator.jamie-181.workers.dev/api/inbound-email";
var SECRET = "SECRET_HERE";

function processInbox() {
  var labels = {
    processed: getOrCreateLabel("processed"),
    unmatched: getOrCreateLabel("unmatched"),
    failed: getOrCreateLabel("failed"),
  };

  var threads = GmailApp.search("in:inbox is:unread has:attachment", 0, 20);
  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var outcome = "processed";
    var messages = thread.getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      if (!msg.isUnread()) continue;
      var atts = msg.getAttachments({ includeInlineImages: false });
      if (atts.length === 0) continue;

      var payload = {
        from: msg.getFrom(),
        subject: msg.getSubject(),
        attachments: atts.map(function (a) {
          return {
            filename: a.getName(),
            contentType: a.getContentType(),
            dataBase64: Utilities.base64Encode(a.getBytes()),
          };
        }),
      };

      try {
        var res = UrlFetchApp.fetch(ENDPOINT, {
          method: "post",
          contentType: "application/json",
          headers: { "X-Inbound-Secret": SECRET },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        var code = res.getResponseCode();
        if (code === 404) outcome = "unmatched";
        else if (code >= 400) outcome = "failed";
      } catch (e) {
        outcome = "failed";
      }
    }
    thread.addLabel(labels[outcome]);
    thread.markRead();
    thread.moveToArchive();
  }
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
