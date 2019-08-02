let acorn = require("acorn");

// BYTE COMMANDS / Pointer commands
SET_PC_TO_BYTE = "B1";
JMP_IF_ACC_EQ_MEM = "B2";
JMP_IF_ACC_EQ_LITERAL = "B3";

// COUNTER COMMANDS
ADD_LITERAL_TO_COUNTER = "C1";
INC_COUNTER = "C2";
DEC_COUNTER = "C3";
RESET_COUNTER = "C4";
MOVE_COUNTER_TO_ACC = "C5";
MOVE_ACC_TO_COUNTER = "C6";

// ACCUMULATOR FUNCTIONS
ADD_MEM_TO_ACC = "C0"; // this is a weird command
MOVE_MEM_TO_ACC = "D0";
SET_ACC_TO_LITERAL = "D1";
MOVE_ACC_TO_MEM = "D2";

// END
STOP = "00";

MAX_MEMORY = 16;

//update so you have to delcare variables
//TODO: throw errors with reason why it doesn't work

//get program
function convertToAssembly(str) {
    let ast = acorn.parse(str);
    console.log(JSON.stringify(ast["body"]));
    //get params
    body = ast["body"][0]
    paramList = body["params"]
    paramMap = {}
    memoryLocation = MAX_MEMORY - 1; // last location in memory
    console.log(paramList)
    for (var param of paramList) {
        paramMap[param.name] = memoryLocation;
        memoryLocation--;
    }
    env = {}
    env['params'] = paramMap;
    env['memLocation'] = memoryLocation;
    env['commands'] = [];
    funcBody = body["body"]
    
    output = parse(funcBody, env);
    console.log(output.join(" "))
}

function parse(ast, env) {
    var type = ast["type"]
    switch (type) {
        case "ReturnStatement":
            return returnStatement(ast, env);
            break;
        case "BinaryExpression":
            if (ast.operator == "+") {
                return addStatement(ast, env);
            } else {

            }
            break;
        case "BlockStatement":
            return blockStatement(ast, env);
            break;
        case "ExpressionStatement":
            return expressionStatement(ast, env);
            break;
        case "AssignmentExpression":
            return assignmentStatement(ast, env);
            break;
        case "ForStatement":
            return forStatement(ast, env);
            break;
        case "Literal":
        case "LiteralExpression":
            return [SET_ACC_TO_LITERAL, numToHex(ast.raw)];
            break;
        case "Identifier":
            return [MOVE_MEM_TO_ACC, numToHex(env.params[ast.name])];
            break;
        default:
            return [];
    }
}

function expressionStatement(ast, env) {
    var command = parse(ast.expression, env);
    return command;
}

function blockStatement(ast, env) {
    var blockCommands = []
    for (statement of ast.body) {
        command = parse(statement, env);
        blockCommands = blockCommands.concat(command);
        env.commands = blockCommands;
    }
    return blockCommands;
}

function returnStatement(ast, env) {
    var command = parse(ast.argument, env);
    return command.concat([
        MOVE_ACC_TO_MEM, "00",  // MOVE ACC TO RETURN
        STOP                    // stop exec
    ]);
}

//TODO: do not allow for variables that are not in the map;
function assignmentStatement(ast, env) {
    var commands = []
    if (!env.params[ast.left.name]) {
        env.params[ast.left.name] = env.memLocation;
        env.memLocation--;
        ast.raw = 0;
        commands = saveLiteral(ast, numToHex(env.params[ast.left.name]))
    }
    var leftVar = env.params[ast.left.name];

    var rightCommands = parse(ast.right, env);
    
    return commands.concat(rightCommands.concat([MOVE_ACC_TO_MEM, numToHex(leftVar)]));
}

// TODO: add support for i++
// write optimizer that changes i++ to i = i + 1; this way i don't have to write edge cases
function forStatement(ast, env) {
    var initCommands = parse(ast.init, env);
    var testCommands = notEquals(ast.test, env);
    var updateCommand = assignmentStatement(ast.update, env);

    newEnv = {
        "params": env.params,
        "memLocation": env.memLocation,
        "commands": []
    }
    var bodyCommmands = parse(ast.body, newEnv);

    // need the memory location of the for loop
    var startForLoopLoc = env.commands.concat(initCommands).concat(testCommands).length - 4; // subtract 4, (2) for moving, (2) for the check w/o the other jmp yet
    var jmpToStart = [SET_PC_TO_BYTE, numToHex(startForLoopLoc)];

    // find the end of the for loop
    var currPointer = env.commands.concat(initCommands).concat(updateCommand).concat(testCommands).concat(bodyCommmands).concat(jmpToStart).length + 1; // add 1 so we out of the for loop

    // finish the test command with where to jump if equals
    var testCommands = testCommands.concat([numToHex(currPointer)]);

    return [].concat(initCommands).concat(testCommands).concat(updateCommand).concat(bodyCommmands).concat(jmpToStart);
}

//TODO: clean up addStatement and notEqualsStatement if possible
//TODO: allow for (1 + 1) + 1
// the add statement leaves the result in ACC...
// that would work since the left commands would result with that being in ACC
//TODO: write optimzir that changes AST that expands 1 + 1 + 1 to something managable by this
//rewrite this
function addStatement(ast, env) {
    // TODO: OPTIMZE BY USING THE COUNTER?
    // WILL RUN INTO ISSUES IF I WANT TO USE THE COUTNER FOR FOR LOOP
    var memLocation = env.memLocation
    var leftCommand = [];
    var rightCommand = [];

    var left = -1; // this will be the eventual memory location of the left value
    var right = -1;// this will be the eventual memory location of the right value

    // TODO: optimize just by setting the left to the ACC since we know it needs to go there
    // change this to call the parse function, would allow for nested additions
    if (isLiteral(ast.left)) { // if the left side is a literal, we need to get memory for it and set the value
        left = memLocation;
        leftCommand = saveLiteral(ast.left, memLocation)
        memLocation--;
    } else {
        left = env.params[ast.left.name]
    }

    // TODO: Optimize if literal, have option to add the value directly to the ACC
    if (isLiteral(ast.right)) { // if the left side is a literal, we need to get memory for it and set the value
        right = memLocation;
        rightCommand = saveLiteral(ast.right, memLocation)
        memLocation--;
    } else {
        right = env.params[ast.right.name]
    }

    var command = [].concat(leftCommand);
    command = command.concat(rightCommand);

    command = command.concat([
        MOVE_MEM_TO_ACC, numToHex(left),                    //move left to ACC
        ADD_MEM_TO_ACC, numToHex(right)                     //add right mem to ACC
    ]);
    return command; // return sum in acc
}

function notEquals(ast, env) {
    var memLocation = env.memLocation
    var leftCommand = [];
    var rightCommand = [];

    var left = -1;
    var right = -1;

    if (isLiteral(ast.left)) {
        left = memLocation; // variable location of left
        leftCommand = saveLiteral(ast.left, memLocation)
        memLocation--;
    } else {
        left = env.params[ast.left.name] // variable location of left
    }

    if (isLiteral(ast.right)) {
        right = memLocation;
        rightCommand = saveLiteral(ast.right, memLocation)
        memLocation--;
    } else {
        right = env.params[ast.right.name]
    }

    var command = [].concat(leftCommand);
    command = command.concat(rightCommand);

    command = command.concat([
        MOVE_MEM_TO_ACC, numToHex(left),                    //move left to ACC
        JMP_IF_ACC_EQ_MEM, numToHex(right)                  // jump command if left == right
    ]);
    return command;
}

function isLiteral(ast) {
    return ast.type == "Literal";
}

function saveLiteral(ast, memLoc) {
    return [ 
        MOVE_ACC_TO_MEM, "00",                          // save acc in 00
        SET_ACC_TO_LITERAL, numToHex(ast.raw),          // save literal to acc
        MOVE_ACC_TO_MEM, numToHex(memLoc),              // move literal to memory
        MOVE_MEM_TO_ACC, "00"                           // move original acc back
        ];
}

function numToHex(num) {
    // check length
    var hex = num.toString(16).toUpperCase();
    if (hex.length == 1) {
        return "0" + hex
    }
    return hex;
}



fib = `function fib(n) {
    prev = 0
    curr = 1
    next = 3
    for (i = 0; i != n; i = i + 1) {
        next = prev + curr
        prev = curr
        curr = next
    }
    return prev
}`

sum = `function sum(a, b) {
    return a + b
}`

convertToAssembly(sum);
