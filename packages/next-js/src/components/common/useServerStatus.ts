import { ServerStatusContext, useContext } from "./ServerStatusContext";

export const useServerStatus = () => {
	const context = useContext(ServerStatusContext);
	if (!context) {
		throw new Error(
			"useServerStatus must be used within a ServerStatusProvider",
		);
	}
	return context;
};
