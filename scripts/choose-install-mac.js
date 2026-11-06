function run(argv) {
    var data = JSON.parse(argv[0]);
    var app = Application.currentApplication();
    app.includeStandardAdditions = true;
    try {
        if (data.options.length > 1) {
            var choices = data.options.concat(["选择其他位置…"]);
            var selected = app.chooseFromList(choices, { withPrompt: data.message, okButtonName: "选择", cancelButtonName: "取消" });
            if (!selected) return "";
            if (selected[0] !== "选择其他位置…") return selected[0];
        }
        return app.chooseFile({withPrompt: data.message, ofType: ["com.apple.application-bundle"]}).toString();
    } catch (error) {
        if (error.errorNumber === -128) return "";
        throw error;
    }
}
