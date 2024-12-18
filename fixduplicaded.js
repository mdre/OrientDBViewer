const fs = require('fs').promises;

function removeDuplicateRelationships(relationships) {
  const uniqueRelationships = [];
  const seen = new Set();

  for (const rel of relationships) {
    // Create a string key from the attributes we want to check for uniqueness
    const key = `${rel.edgeName}-${rel.from}-${rel.to}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      console.log(key);
      uniqueRelationships.push(rel);
    }
  }

  return uniqueRelationships;
}

async function main() {
  try {
    // Read the JSON file
    const data = JSON.parse(await fs.readFile('scheme.json', 'utf8'));

    // Process the relationships
    data.relationships = removeDuplicateRelationships(data.relationships);

    // Write the updated data back to the file
    await fs.writeFile('scheme.json', JSON.stringify(data, null, 2));

    console.log('Processing complete. Updated scheme.json file.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();