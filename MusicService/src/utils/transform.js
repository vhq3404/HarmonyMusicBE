function toSongResponse(song) {
  if (!song) return null;
  const { id, ...rest } = song;
  return { _id: id, ...rest };
}

function toPlaylistResponse(playlist, orderedSongIds) {
  if (!playlist) return null;
  const { id, playlistSongs, ...rest } = playlist;
  const songIds =
    orderedSongIds !== undefined
      ? orderedSongIds
      : (playlistSongs ? playlistSongs.map((ps) => ps.songId) : []);
  return { _id: id, songIds, ...rest };
}

function toCommentResponse(comment) {
  if (!comment) return null;
  const { id, ...rest } = comment;
  return { _id: id, ...rest };
}

module.exports = { toSongResponse, toPlaylistResponse, toCommentResponse };
