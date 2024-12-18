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
let vertices = [];
let edges = [];
let relationships = [];
let dbConfig;
// utilizado para determinar que relaciones ya se agregaron 
let duplicatedRelationshipsTest = new Set();

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

// Función para actualizar el esquema desde OrientDB
const updateScheme = async () => {
    loadDBConfig();
    try {
        const client = await OrientDBClient.connect({
            host: dbConfig.host,
            port: dbConfig.port,
        });

        const session = await client.session({
            name: dbConfig.database,
            username: dbConfig.user,
            password: dbConfig.password,
        });

        console.log("Conectado a OrientDB");

        // Recuperar todas las clases del esquema
        const allClasses = await session.query("SELECT expand(classes) FROM metadata:schema ORDER BY name").all();

        // Función recursiva para encontrar las clases que heredan de una superclase
        const findSubclasses = (superclassName) => {
            return allClasses
                .filter((cls) => cls.superClass === superclassName)
                .map((cls) => ({
                    className: cls.name,
                    superClass: cls.superClass || null,
                }))
                .concat(
                    allClasses
                        .filter((cls) => cls.superClass === superclassName)
                        .flatMap((cls) => findSubclasses(cls.name))
                );
        };

        // Identificar vértices y edges
        vertices = findSubclasses("V");
        edges = findSubclasses("E");

        console.log("Vértices detectados:", vertices);
        console.log("Edges detectados:", edges);

        // Crear edges entre clases y sus superclases
        allClasses.forEach((cls) => {
            const superClass = cls.superClass;
            if (superClass && superClass !== "V" && superClass !== "E") {
                relationships.push({
                    edgeName: "Inheritance",
                    from: superClass,
                    to: cls.name,
                    color: {
                        color: "#55aaff",
                        highlight: "#0055ff",
                        hover: "#0055ff",
                        inherit: "from",
                        opacity: 1.0,
                    },
                });
            }
        });

        // Procesar relaciones entre edges y nodos
        const relationshipPromises = edges.map((edge) => 
            session
                .query(`select $fromSuperClass[0].superClass as fromSC, 
                               fromClass, 
                               toClass, 
                               $toSuperClass[0].superClass as toSC 
                            from (SELECT distinct 
                                            out.@class as fromClass, 
                                            in.@class as toClass 
                                    FROM ${edge.className} 
                                ) 
                            LET $fromSuperClass = (SELECT superClass 
                                                        FROM 
                                                            (SELECT expand(classes) FROM metadata:schema) 
                                                        WHERE name = $parent.$current.fromClass), 
                                $toSuperClass = (SELECT superClass 
                                                        FROM 
                                                            (SELECT expand(classes) FROM metadata:schema) 
                                                        WHERE name = $parent.$current.toClass)`)
                .all()
                .then((edgeDefinition) => {
                    edgeDefinition.forEach((e) => {
                        // Verificar si la relación ya existe
                        fc = e.fromSC && e.fromSC !== "V" ? e.fromSC : e.fromClass;
                        tc = e.toSC && e.toSC !== "V" ? e.toSC : e.toClass;
                        
                        const edgeTest = ""+edge+">"+fc+">"+tc;

                        if (!duplicatedRelationshipsTest.has(edgeTest)) {
                            duplicatedRelationshipsTest.add(edgeTest);
                            relationships.push({
                                edgeName: edge,
                                from: fc,
                                to: tc,
                                color: {
                                    color: "#848484",
                                    highlight: "#00aaff",
                                    hover: "#00aaff",
                                    inherit: "from",
                                    opacity: 1.0,
                                },
                            });
                            console.log(edge, e);
                        }
                    });
                })
                .catch((err) => console.error("Error: ",edge))
            
        );

        // Esperar a que se completen todas las relaciones
        await Promise.all(relationshipPromises);

        // Guardar los datos en scheme.json
        const schemeData = { vertices, relationships };
        fs.writeFileSync(SCHEME_FILE, JSON.stringify(schemeData, null, 2));
        console.log(`Esquema guardado en ${SCHEME_FILE}`);

        await session.close();
        await client.close();
    } catch (error) {
        console.error("Error al actualizar el esquema:", error);
    }
};

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
    try {
        res.json({ vertices, relationships });
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
