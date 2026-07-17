# Builds the JSON payloads for the character-manifest API. `call` returns the
# full manifest (including its `data` blob); `summary` is the lightweight
# roster row used by the index, which omits the (potentially large) blob.
module Character
  module CharacterManifestSerializer
    module_function

    def call(manifest)
      summary(manifest).merge(data: manifest.data)
    end

    def summary(manifest)
      {
        id: manifest.id,
        name: manifest.name,
        active: manifest.active,
        updated_at: manifest.updated_at
      }
    end
  end
end
