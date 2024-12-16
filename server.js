const fs = require("fs");
const path = require("path");
const OrientDBClient = require("orientjs").OrientDBClient;
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;
const SCHEME_FILE = path.join(__dirname, "scheme.json");
const DB_CONFIG_FILE = path.join(__dirname, "db.json");

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Conexión con OrientDB
let orientdb;
let vertices;
let edges;
let relationships = [];
let dbConfig;

// Función para cargar configuración de la base de datos
const loadDBConfig = () => {
    try {
      if (fs.existsSync(DB_CONFIG_FILE)) {
        dbConfig = JSON.parse(fs.readFileSync(DB_CONFIG_FILE, "utf-8"));
        console.log("Configuración de la base de datos cargada desde db.json");
      } else {
        throw new Error(`Archivo de configuración ${DB_CONFIG_FILE} no encontrado.`);
      }
    } catch (error) {
      console.error("Error al cargar la configuración de la base de datos:", error);
      process.exit(1); // Terminar el proceso si no se puede cargar la configuración
    }
};
  


const updateScheme = async () => {
    loadDBConfig();
    OrientDBClient.connect({
        host: dbConfig.host,
        port: deConfig.port
    }).then((client) => {
        orientdb = client.session({
            name: dbConfig.database,
            username: dbConfig.user,
            password: dbConfig.password,
        }).then(session => {
            console.log("Conectado a OrientDB");
            console.log(orientdb);
            session.query("SELECT FROM (SELECT expand(classes) FROM metadata:schema) order by name")
                .all()
                .then((result) => {
                    // console.log(result);
                    allClasses = result;

                    // Función recursiva para encontrar las clases que heredan de una superclase
                    const findSubclasses = (superclassName) => {
                        return allClasses
                            .filter((cls) => cls.superClass === superclassName)
                            .map((cls) => cls.name)
                            .concat(
                                allClasses
                                    .filter((cls) => cls.superClass === superclassName)
                                    .flatMap((cls) => findSubclasses(cls.name))
                            );
                    };

                    // vertices = clases.filter((cls) => cls.superClass === "V").map((cls) => cls.name);
                    vertices = findSubclasses("V");

                    // Crear edges entre clases y sus superclases
                    allClasses.forEach((cls) => {
                        const superClass = cls.superClass;
                        if (superClass && superClass !== "V" && superClass !== "E") {
                            relationships.push({
                                edgeName: "Inheritance",
                                from: superClass,
                                to: cls.name,
                                color: {
                                    color: '##55aaff',
                                    highlight: '##0055ff',
                                    hover: '##0055ff',
                                    inherit: 'from',
                                    opacity: 1.0
                                }
                            });
                        }
                    });

                    // edges = clases.filter((cls) => cls.superClass === "E").map((cls) => cls.name);
                    edges = findSubclasses("E");
                    console.log("allClasses: " + allClasses.length + " vertices: " + vertices.length + " edges: " + edges.length);
                    // Determinar las relaciones entre vértices y edges

                    for (const edge of edges) {
                        session.query(`SELECT distinct out.@class as fromClass, in.@class as toClass FROM ${edge}`)
                            .all()
                            .then((edgeDefinition) => {
                                if (edgeDefinition.length > 0) {
                                    edgeDefinition.forEach((e) => {
                                        relationships.push({
                                            edgeName: edge,
                                            from: e.fromClass || "Desconocido",
                                            to: e.toClass || "Desconocido",
                                            color: {
                                                color: '#848484',
                                                highlight: '##00aaff',
                                                hover: '##00aaff',
                                                inherit: 'from',
                                                opacity: 1.0
                                            }
                                        });
                                        console.log(edge, e);
                                    });
                                    
                                } else {
                                    console.log(edge, "<<<<<<------ NO RELATION FOUND");
                                }
                            });
                    }

                    // Guardar los datos en scheme.json
                    const schemeData = { vertices, relationships };
                    fs.writeFileSync(SCHEME_FILE, JSON.stringify(schemeData, null, 2));
                    console.log(`Esquema guardado en ${SCHEME_FILE}`);

                });
        });

    });
}

// Función para cargar el esquema desde scheme.json
const loadScheme = () => {
    try {
        if (fs.existsSync(SCHEME_FILE)) {
            const schemeData = JSON.parse(fs.readFileSync(SCHEME_FILE, "utf-8"));
            vertices = schemeData.vertices;
            relationships = schemeData.relationships;
            console.log("Esquema cargado desde scheme.json");
        } else {
            console.log("scheme.json no encontrado. Generando nuevo esquema...");
            updateScheme();
        }
    } catch (error) {
        console.error("Error al cargar el esquema:", error);
    }
};


// Ruta para obtener clases de vértices y edges
app.get("/classes", async (req, res) => {
    console.log(orientdb);
    try {
        //const result = await orientdb.query("SELECT FROM (SELECT expand(classes) FROM metadata:schema)");
        // const vertices = clases.filter((cls) => cls.superClass === "V").map((cls) => cls.name);
        // const edges = clases.filter((cls) => cls.superClass === "E").map((cls) => cls.name);

        // Determinar las relaciones entre vértices y edges
        // const relationships = [];
        // for (const edge of edges) {
        //     const edgeDefinition = await orientdb.query(`SELECT out, in FROM ${edge} LIMIT 1`);
        //     if (edgeDefinition.length > 0) {
        //         relationships.push({
        //             edgeName: edge,
        //             from: edgeDefinition[0].out || "Desconocido",
        //             to: edgeDefinition[0].in || "Desconocido",
        //         });
        //     }
        // }
        res.json({ vertices, edges, relationships });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al recuperar clases de OrientDB" });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    loadScheme(); // Cargar esquema al arrancar el servidor
});
